import os
import sys
import time
import json
import csv
import subprocess
import datetime
import argparse

def get_backend_pid():
    try:
        out = subprocess.check_output("lsof -t -i:5001", shell=True).decode().strip()
        if out:
            return out.split("\n")[0]
    except Exception:
        pass
    return None

def get_resource_usage(pid):
    if not pid:
        return {"cpu": 0.0, "rss_mb": 0.0, "vsz_mb": 0.0}
    try:
        out = subprocess.check_output(f"ps -o %cpu,rss,vsz -p {pid}", shell=True).decode().strip().split("\n")[1]
        parts = out.split()
        return {
            "cpu": float(parts[0]),
            "rss_mb": round(int(parts[1]) / 1024.0, 2),
            "vsz_mb": round(int(parts[2]) / 1024.0, 2)
        }
    except Exception:
        return {"cpu": 0.0, "rss_mb": 0.0, "vsz_mb": 0.0}

def get_mongo_customer_count():
    try:
        cmd = """node -e '
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
await mongoose.connect(process.env.PRO_MONGO_URI);
const Customer = mongoose.model("Customer", new mongoose.Schema({}, { strict: false }));
const User = mongoose.model("User", new mongoose.Schema({}, { strict: false }));
const user = await User.findOne({ email: "jmeter_loadtest@saaiss.in" });
const count = user ? await Customer.countDocuments({ $or: [{ userId: user._id }, { userId: user._id.toString() }] }) : 0;
console.log(count);
await mongoose.disconnect();
'"""
        backend_dir = os.path.abspath("backend")
        out = subprocess.check_output(cmd, shell=True, cwd=backend_dir).decode().strip()
        lines = [line.strip() for line in out.split("\n") if line.strip() and not line.strip().startswith("[")]
        if lines:
            return int(lines[-1])
        return 0
    except Exception as e:
        print(f"⚠️ Warning counting customers: {e}")
        return 0

def parse_jtl(jtl_path):
    if not os.path.exists(jtl_path):
        return None

    records = []
    with open(jtl_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)

    total = len(records)
    if total == 0:
        return None

    passed = sum(1 for r in records if r["success"] == "true")
    failed = total - passed
    err_pct = (failed / total) * 100.0

    elapsed = sorted([int(r["elapsed"]) for r in records])
    avg_rt = sum(elapsed) / total
    min_rt = elapsed[0]
    max_rt = elapsed[-1]

    p50 = elapsed[int(0.50 * total)]
    p90 = elapsed[int(0.90 * total)]
    p95 = elapsed[int(0.95 * total)]
    p99 = elapsed[min(int(0.99 * total), total - 1)]

    timestamps = [int(r["timeStamp"]) for r in records]
    start_ts = min(timestamps)
    end_ts = max([int(r["timeStamp"]) + int(r["elapsed"]) for r in records])
    duration_sec = (end_ts - start_ts) / 1000.0 if end_ts > start_ts else 1.0

    throughput = total / duration_sec if duration_sec > 0 else 0.0

    conn_errors = sum(1 for r in records if r["success"] != "true" and ("ConnectException" in r.get("responseMessage", "") or "Timeout" in r.get("responseMessage", "")))
    status_5xx = sum(1 for r in records if r.get("responseCode", "").startswith("5"))
    status_4xx = sum(1 for r in records if r.get("responseCode", "").startswith("4"))

    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "err_pct": round(err_pct, 2),
        "avg": round(avg_rt, 2),
        "min": min_rt,
        "max": max_rt,
        "p50": p50,
        "p90": p90,
        "p95": p95,
        "p99": p99,
        "throughput": round(throughput, 2),
        "duration_sec": round(duration_sec, 2),
        "conn_errors": conn_errors,
        "status_5xx": status_5xx,
        "status_4xx": status_4xx
    }

def run_suite(stages, run_prefix="jmeter_runs"):
    TIMESTAMP = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    RUN_DIR = os.path.abspath(f"{run_prefix}_{TIMESTAMP}")
    os.makedirs(RUN_DIR, exist_ok=True)

    JMX_PLAN = os.path.abspath("load_test_plan.jmx")
    pid = get_backend_pid()

    print(f"==================================================")
    print(f"🚀 Apache JMeter Execution Initiated")
    print(f"📍 Execution Directory: {RUN_DIR}")
    print(f"🔍 Backend PID: {pid}")
    print(f"==================================================")

    results = []

    for idx, stage in enumerate(stages, 1):
        threads = stage["threads"]
        loop_count = stage["loop_count"]
        rampup = stage["rampup"]
        stage_timeout = stage.get("timeout", 180)

        stage_name = f"stage_{threads}_users"
        stage_dir = os.path.join(RUN_DIR, stage_name)
        jtl_file = os.path.join(stage_dir, "results.jtl")
        html_dir = os.path.join(stage_dir, "html_report")
        log_file = os.path.join(stage_dir, "jmeter.log")

        os.makedirs(stage_dir, exist_ok=True)

        print(f"\n--------------------------------------------------")
        print(f"⚡ [Stage {idx}/{len(stages)}] Executing {threads} Concurrent Users")
        print(f"⚙️ Config: {threads} threads | {loop_count} loops/thread | {rampup}s rampup | max timeout {stage_timeout}s")

        pre_metrics = get_resource_usage(pid)
        pre_cust_count = get_mongo_customer_count()

        cmd = [
            "jmeter", "-n",
            "-t", JMX_PLAN,
            f"-Jthreads={threads}",
            f"-JloopCount={loop_count}",
            f"-Jrampup={rampup}",
            "-l", jtl_file,
            "-j", log_file,
            "-e", "-o", html_dir
        ]

        cmd_str = " ".join(cmd)
        print(f"💻 Command: {cmd_str}")

        start_time = time.time()
        process = subprocess.Popen(cmd_str, shell=True)

        peak_cpu = 0.0
        peak_rss = 0.0
        timed_out = False

        while True:
            ret_code = process.poll()
            if ret_code is not None:
                break

            elapsed = time.time() - start_time
            if elapsed > stage_timeout:
                print(f"⚠️ STAGE TIMEOUT EXCEEDED ({stage_timeout}s)! Terminating process...")
                process.terminate()
                time.sleep(2)
                if process.poll() is None:
                    process.kill()
                timed_out = True
                ret_code = -1
                break

            time.sleep(1)
            usage = get_resource_usage(pid)
            if usage["cpu"] > peak_cpu:
                peak_cpu = usage["cpu"]
            if usage["rss_mb"] > peak_rss:
                peak_rss = usage["rss_mb"]

        end_time = time.time()

        post_metrics = get_resource_usage(pid)
        post_cust_count = get_mongo_customer_count()
        created_custs = post_cust_count - pre_cust_count

        stats = parse_jtl(jtl_file)

        stage_result = {
            "threads": threads,
            "cmd": cmd_str,
            "exit_code": ret_code,
            "timed_out": timed_out,
            "jtl_file": jtl_file,
            "html_dir": html_dir,
            "log_file": log_file,
            "stats": stats,
            "peak_cpu": peak_cpu,
            "peak_rss": peak_rss,
            "pre_rss": pre_metrics.get("rss_mb", 0),
            "post_rss": post_metrics.get("rss_mb", 0),
            "created_customers": created_custs,
            "elapsed_seconds": round(end_time - start_time, 2)
        }

        results.append(stage_result)

        print(f"\n📊 STAGE SUMMARY [Stage {idx}/{len(stages)}]:")
        print(f"  • Exit Code: {ret_code} {'(TIMED OUT)' if timed_out else '(CLEAN EXIT)'}")
        print(f"  • Execution Time: {end_time - start_time:.2f} seconds")

        if stats:
            print(f"  • Total Requests: {stats['total']}")
            print(f"  • Passed: {stats['passed']} | Failed: {stats['failed']} | Err%: {stats['err_pct']}%")
            print(f"  • Response Times: Avg {stats['avg']}ms | Min {stats['min']}ms | Max {stats['max']}ms | P50 {stats['p50']}ms | P95 {stats['p95']}ms | P99 {stats['p99']}ms")
            print(f"  • Throughput: {stats['throughput']} req/sec")
        else:
            print(f"  ⚠️ No JTL statistics available")

        print(f"  • Peak Resource Usage: CPU {peak_cpu}% | RSS {peak_rss} MB")
        print(f"  • MongoDB Customer Writes: {created_custs} records")

        time.sleep(1)

    summary_path = os.path.join(RUN_DIR, "summary_results.json")
    with open(summary_path, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n==================================================")
    print(f"✅ Execution Complete! Summary written to: {summary_path}")
    print(f"==================================================")

    return RUN_DIR, results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JMeter Load Test Runner")
    parser.add_argument("--validation", action="store_true", help="Run 5-user validation test only")
    parser.add_argument("--threads", type=int, help="Run specific thread count only")
    args = parser.parse_args()

    if args.validation:
        stages = [{"threads": 5, "loop_count": 2, "rampup": 1, "timeout": 60}]
        run_suite(stages, run_prefix="jmeter_validation")
    elif args.threads:
        t = args.threads
        if t == 100:
            stages = [{"threads": 100, "loop_count": 10, "rampup": 15, "timeout": 360}]
        else:
            stages = [{"threads": t, "loop_count": 10, "rampup": 15, "timeout": 360}]
        run_suite(stages, run_prefix=f"jmeter_stage_{t}")
    else:
        stages = [
            {"threads": 25,  "loop_count": 20, "rampup": 10, "timeout": 120},
            {"threads": 50,  "loop_count": 20, "rampup": 10, "timeout": 150},
            {"threads": 100, "loop_count": 20, "rampup": 15, "timeout": 300},
            {"threads": 200, "loop_count": 15, "rampup": 20, "timeout": 360},
            {"threads": 300, "loop_count": 10, "rampup": 25, "timeout": 420},
            {"threads": 500, "loop_count": 10, "rampup": 30, "timeout": 600},
        ]
        run_suite(stages, run_prefix="jmeter_runs")
