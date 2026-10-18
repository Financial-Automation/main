import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// ✅ Project Task Schema with tenant isolation
const taskSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    projectName: { type: String, required: true },
    projectId: { type: String, required: true },
    projectDescription: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    tasks: [
        {
            name: { type: String, required: true },
            duration: { type: Number, required: true },
            dependencies: [{ type: String }],
            es: { type: Number },
            ef: { type: Number },
            ls: { type: Number },
            lf: { type: Number },
            slack: { type: Number },
            critical: { type: Boolean }
        }
    ],
    criticalPath: [{ type: String }],
    totalDuration: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Planning', 'In Progress', 'Completed', 'Delayed'],
        default: 'Planning'
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Project = mongoose.model("Project", taskSchema);

// ✅ POST route to create/update project schedule
router.post("/create", async (req, res) => {
    try {
        const projectData = {
            ...req.body,
            userId: req.user.id
        };

        // Clean up dependency names (remove whitespace and standardize)
        if (projectData.tasks) {
            projectData.tasks = projectData.tasks.map(task => ({
                ...task,
                dependencies: (task.dependencies || []).map(dep => 
                    dep.trim().replace(/\s+/g, ' ').replace(/=/g, '-')
                )
            }));
        }

        // Perform CPM calculations on the backend
        const tasksWithCPM = calculateCPM(projectData.tasks || []);
        projectData.tasks = tasksWithCPM.tasks;
        projectData.criticalPath = tasksWithCPM.criticalPath;
        projectData.totalDuration = tasksWithCPM.totalDuration;

        const newProject = new Project(projectData);
        await newProject.save();

        res.status(201).json({
            message: "Project schedule created successfully!",
            project: newProject
        });
    } catch (error) {
        console.error("Error creating project schedule:", error);
        res.status(500).json({ message: "Error creating project schedule", error });
    }
});

// ✅ GET route to fetch all projects for authenticated user
router.get("/all", async (req, res) => {
    try {
        const projects = await Project.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(projects);
    } catch (error) {
        console.error("Error fetching projects:", error);
        res.status(500).json({ message: "Error fetching projects" });
    }
});

// ✅ GET route to fetch single project by ID for authenticated user
router.get("/:id", async (req, res) => {
    try {
        const project = await Project.findOne({ _id: req.params.id, userId: req.user.id });
        if (!project) {
            return res.status(404).json({ message: "Project not found" });
        }
        res.json(project);
    } catch (error) {
        console.error("Error fetching project:", error);
        res.status(500).json({ message: "Error fetching project" });
    }
});

// ✅ PUT route to update project for authenticated user
router.put("/:id", async (req, res) => {
    try {
        const projectData = req.body;
        projectData.updatedAt = Date.now();
        delete projectData.userId; // Prevent hijacking user ID

        // Clean up dependency names
        if (projectData.tasks) {
            projectData.tasks = projectData.tasks.map(task => ({
                ...task,
                dependencies: (task.dependencies || []).map(dep => 
                    dep.trim().replace(/\s+/g, ' ').replace(/=/g, '-')
                )
            }));
        }

        // Recalculate CPM if tasks were updated
        if (projectData.tasks) {
            const tasksWithCPM = calculateCPM(projectData.tasks);
            projectData.tasks = tasksWithCPM.tasks;
            projectData.criticalPath = tasksWithCPM.criticalPath;
            projectData.totalDuration = tasksWithCPM.totalDuration;
        }

        const updatedProject = await Project.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            projectData,
            { new: true }
        );

        if (!updatedProject) {
            return res.status(404).json({ message: "Project not found" });
        }

        res.json({
            message: "Project updated successfully!",
            project: updatedProject
        });
    } catch (error) {
        console.error("Error updating project:", error);
        res.status(500).json({ message: "Error updating project", error });
    }
});

// ✅ DELETE route to remove project for authenticated user
router.delete("/:id", async (req, res) => {
    try {
        const deletedProject = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!deletedProject) {
            return res.status(404).json({ message: "Project not found" });
        }
        res.json({ message: "Project deleted successfully!" });
    } catch (error) {
        console.error("Error deleting project:", error);
        res.status(500).json({ message: "Error deleting project", error });
    }
});

// ✅ Enhanced CPM Calculation Function
function calculateCPM(tasks) {
    if (!tasks || tasks.length === 0) {
        return { tasks: [], criticalPath: [], totalDuration: 0 };
    }
    
    // Create task map with cleaned names
    const taskMap = {};
    const nameToId = {};
    
    // First pass: create task map and clean names
    tasks.forEach((task, index) => {
        const cleanedName = task.name.trim().replace(/\s+/g, ' ').replace(/=/g, '-');
        const taskId = `T${index + 1}`;
        
        taskMap[taskId] = {
            ...task,
            id: taskId,
            name: cleanedName,
            // Clean dependencies
            dependencies: (task.dependencies || []).map(dep => 
                dep.trim().replace(/\s+/g, ' ').replace(/=/g, '-')
            )
        };
        nameToId[cleanedName] = taskId;
    });

    // Build graph
    const graph = {};
    Object.keys(taskMap).forEach(taskId => {
        graph[taskId] = {
            duration: taskMap[taskId].duration,
            successors: [],
            predecessors: []
        };
    });

    // Build dependencies
    Object.keys(taskMap).forEach(taskId => {
        const task = taskMap[taskId];
        task.dependencies.forEach(depName => {
            const depId = nameToId[depName];
            if (depId && depId !== taskId) {
                graph[depId].successors.push(taskId);
                graph[taskId].predecessors.push(depId);
            }
        });
    });

    // Cycle detection to prevent infinite recursion / NaN propagation
    const cycleVisiting = new Set();
    const cycleVisited = new Set();
    let hasCycle = false;

    function detectCycle(nodeId) {
        if (cycleVisiting.has(nodeId)) {
            hasCycle = true;
            return true;
        }
        if (cycleVisited.has(nodeId)) return false;

        cycleVisiting.add(nodeId);
        for (const pred of graph[nodeId]?.predecessors || []) {
            if (detectCycle(pred)) return true;
        }
        cycleVisiting.delete(nodeId);
        cycleVisited.add(nodeId);
        return false;
    }

    for (const nodeId of Object.keys(graph)) {
        if (detectCycle(nodeId)) break;
    }

    if (hasCycle) {
        throw new Error("Circular dependency detected in project tasks. Please eliminate task loops.");
    }

    // Forward Pass (ES, EF)
    const ES = {};
    const EF = {};
    const visited = new Set();

    function forwardPass(nodeId) {
        if (visited.has(nodeId)) return EF[nodeId];
        visited.add(nodeId);

        if (graph[nodeId].predecessors.length === 0) {
            ES[nodeId] = 0;
        } else {
            ES[nodeId] = Math.max(...graph[nodeId].predecessors.map(p => forwardPass(p)));
        }

        EF[nodeId] = ES[nodeId] + graph[nodeId].duration;
        return EF[nodeId];
    }

    Object.keys(graph).forEach(nodeId => forwardPass(nodeId));

    // Backward Pass (LS, LF)
    const LS = {};
    const LF = {};
    const reverseVisited = new Set();
    const efValues = Object.values(EF);
    const totalDuration = efValues.length > 0 ? Math.max(...efValues) : 0;

    function backwardPass(nodeId) {
        if (reverseVisited.has(nodeId)) return LS[nodeId];
        reverseVisited.add(nodeId);

        if (graph[nodeId].successors.length === 0) {
            LF[nodeId] = totalDuration;
        } else {
            LF[nodeId] = Math.min(...graph[nodeId].successors.map(s => backwardPass(s)));
        }

        LS[nodeId] = LF[nodeId] - graph[nodeId].duration;
        return LS[nodeId];
    }

    Object.keys(graph).forEach(nodeId => backwardPass(nodeId));

    // Calculate slack and critical path
    const slack = {};
    const criticalPath = [];

    Object.keys(graph).forEach(nodeId => {
        slack[nodeId] = LS[nodeId] - ES[nodeId];
        
        // Update task with CPM results
        taskMap[nodeId].es = ES[nodeId];
        taskMap[nodeId].ef = EF[nodeId];
        taskMap[nodeId].ls = LS[nodeId];
        taskMap[nodeId].lf = LF[nodeId];
        taskMap[nodeId].slack = slack[nodeId];
        taskMap[nodeId].critical = slack[nodeId] === 0;

        if (slack[nodeId] === 0) {
            criticalPath.push(taskMap[nodeId].name);
        }
    });

    return {
        tasks: Object.values(taskMap),
        criticalPath,
        totalDuration
    };
}

// ✅ POST route to perform CPM calculation only
router.post("/calculate-cpm", async (req, res) => {
    try {
        const { tasks } = req.body;
        
        // Clean task names and dependencies
        const cleanedTasks = tasks.map(task => ({
            ...task,
            name: task.name.trim().replace(/\s+/g, ' ').replace(/=/g, '-'),
            dependencies: (task.dependencies || []).map(dep => 
                dep.trim().replace(/\s+/g, ' ').replace(/=/g, '-')
            )
        }));
        
        const result = calculateCPM(cleanedTasks);
        res.json(result);
    } catch (error) {
        console.error("Error calculating CPM:", error);
        res.status(500).json({ message: "Error calculating CPM", error });
    }
});

// ✅ GET route to get CPM sample data
router.get("/sample/data", async (req, res) => {
    try {
        const sampleTasks = [
            { 
                name: "A-Site preparation", 
                duration: 5, 
                dependencies: [] 
            },
            { 
                name: "B-Foundation", 
                duration: 10, 
                dependencies: ["A-Site Preparation"] 
            },
            { 
                name: "C-Structure", 
                duration: 20, 
                dependencies: ["B-Foundation"] 
            },
            { 
                name: "D-MEP", 
                duration: 15, 
                dependencies: ["C-Structure"] 
            },
            { 
                name: "E-Finishing", 
                duration: 12, 
                dependencies: ["D-MEP"] 
            },
            { 
                name: "F-Handover", 
                duration: 5, 
                dependencies: ["E-Finishing"] 
            }
        ];

        const result = calculateCPM(sampleTasks);
        
        res.json({
            message: "Sample CPM data generated successfully",
            tasks: result.tasks,
            criticalPath: result.criticalPath,
            totalDuration: result.totalDuration,
            sampleData: sampleTasks
        });
    } catch (error) {
        console.error("Error generating sample data:", error);
        res.status(500).json({ message: "Error generating sample data", error });
    }
});

export default router;
