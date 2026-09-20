import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from "jsonwebtoken";
import CivilProject from '../models/CivilProject.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }

    try {
        const JWT_SECRET = process.env.JWT_SECRET || "fallback_jwt_secret_2024_finance_app";
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "Token expired. Please log in again." });
        }
        res.status(401).json({ message: "Invalid token." });
    }
};

// JavaScript CPM Calculation (fallback when Python is unavailable)
function calculateCPMJS(tasks) {
    // Build name-to-id map (case-insensitive)
    const nameToId = {};
    tasks.forEach(task => {
        nameToId[task.name.trim().toLowerCase()] = task.id;
    });

    // Build graph
    const graph = {};
    tasks.forEach(task => {
        graph[task.id] = {
            duration: task.duration,
            name: task.name,
            successors: [],
            predecessors: []
        };
    });

    // Resolve dependencies
    tasks.forEach(task => {
        (task.dependencies || []).forEach(depName => {
            const depId = nameToId[depName.trim().toLowerCase()];
            if (depId && depId !== task.id && graph[depId]) {
                graph[depId].successors.push(task.id);
                graph[task.id].predecessors.push(depId);
            }
        });
    });

    // Forward Pass (ES, EF)
    const ES = {}, EF = {};
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
    const LS = {}, LF = {};
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
    const criticalPath = [];
    const resultTasks = tasks.map(task => {
        const slack = LS[task.id] - ES[task.id];
        const critical = slack === 0;
        if (critical) criticalPath.push(task.name);

        return {
            id: task.id,
            name: task.name,
            duration: task.duration,
            dependencies: task.dependencies || [],
            es: ES[task.id],
            ef: EF[task.id],
            ls: LS[task.id],
            lf: LF[task.id],
            slack,
            critical
        };
    });

    return { tasks: resultTasks, criticalPath, totalDuration };
}

// Endpoint to calculate CPM - tries Python first, falls back to JavaScript
router.post('/calculate-cpm', (req, res) => {
    const tasks = req.body.tasks;

    if (!tasks || !Array.isArray(tasks)) {
        return res.status(400).json({ error: 'Valid tasks array is required' });
    }

    // Path to the python script
    const scriptPath = path.join(__dirname, '..', 'civil_engineering_project_schedule_ui_ai.py');

    // Determine the python command - try venv first, fallback to system python
    const venvPythonPath = path.join(__dirname, '..', 'venv', 'bin', 'python3');
    const systemPython = process.platform === 'win32' ? 'python' : 'python3';

    // Check if venv python exists, otherwise use system python
    const pythonPath = fs.existsSync(venvPythonPath) ? venvPythonPath : systemPython;

    const pythonProcess = spawn(pythonPath, [scriptPath]);

    let pythonOutput = '';
    let pythonError = '';

    // Handle spawn errors — fallback to JS calculation
    pythonProcess.on('error', (err) => {
        console.warn('Python not available, using JS fallback:', err.message);
        try {
            const result = calculateCPMJS(tasks);
            return res.status(200).json(result);
        } catch (jsErr) {
            return res.status(500).json({ error: 'Failed to calculate CPM.', details: jsErr.message });
        }
    });

    // Pass the tasks as a JSON string to standard input
    pythonProcess.stdin.write(JSON.stringify(tasks));
    pythonProcess.stdin.end();

    // Listen for data from standard output
    pythonProcess.stdout.on('data', (data) => {
        pythonOutput += data.toString();
    });

    // Listen for data from standard error
    pythonProcess.stderr.on('data', (data) => {
        pythonError += data.toString();
    });

    // Handle process completion
    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            // Python failed — fallback to JS calculation
            console.warn(`Python script failed (code ${code}), using JS fallback. Error: ${pythonError}`);
            try {
                const result = calculateCPMJS(tasks);
                return res.status(200).json(result);
            } catch (jsErr) {
                return res.status(500).json({ error: 'Failed to calculate CPM.', details: jsErr.message });
            }
        }

        try {
            const result = JSON.parse(pythonOutput);

            if (result.error) {
                return res.status(400).json({ error: result.error });
            }

            res.status(200).json(result);
        } catch (error) {
            console.error('Failed to parse Python output:', pythonOutput);
            res.status(500).json({ error: 'Failed to parse CPM results.', details: error.message });
        }
    });
});

// Endpoint to save a calculated project to project history
router.post('/save-project', verifyToken, async (req, res) => {
    try {
        const { projectName, projectId, projectDescription, startDate, endDate, status, tasks, criticalPath, totalDuration } = req.body;

        const newProject = new CivilProject({
            userId: req.user.id,
            projectName,
            projectId,
            projectDescription,
            startDate,
            endDate,
            status,
            tasks,
            criticalPath,
            totalDuration
        });

        await newProject.save();
        res.status(201).json({ message: "Project saved successfully", project: newProject });
    } catch (error) {
        console.error("Error saving project:", error);
        res.status(500).json({ error: "Failed to save project. Please try again.", details: error.message });
    }
});

// Endpoint to fetch project history for the user
router.get('/history', verifyToken, async (req, res) => {
    try {
        const history = await CivilProject.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(history);
    } catch (error) {
        console.error("Error fetching project history:", error);
        res.status(500).json({ error: "Failed to load project history." });
    }
});

export default router;
