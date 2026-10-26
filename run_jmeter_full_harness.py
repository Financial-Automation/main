import os
import sys
import time
import json
import csv
import subprocess
import datetime

JAVA_HOME = "/opt/homebrew/Cellar/openjdk@21/21.0.12.1/libexec/openjdk.jdk/Contents/Home"
os.environ["JAVA_HOME"] = JAVA_HOME
os.environ["PATH"] = f"{JAVA_HOME}/bin:" + os.environ.get("PATH", "")

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

def parse_jtl(jtl_path):
    if not os.path.exists(jtl_path):
        return None

    records = []
    sampler_stats = {}
    with open(jtl_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
            lbl = row.get("label", "Unknown")
            if lbl not in sampler_stats:
                sampler_stats[lbl] = []
            sampler_stats[lbl].append(row)

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

    by_sampler = {}
    for lbl, rows in sampler_stats.items():
        s_total = len(rows)
        s_passed = sum(1 for r in rows if r["success"] == "true")
        s_failed = s_total - s_passed
        s_err_pct = (s_failed / s_total) * 100.0
        s_elapsed = sorted([int(r["elapsed"]) for r in rows])
        s_avg = sum(s_elapsed) / s_total
        s_p95 = s_elapsed[int(0.95 * s_total)]
        s_p99 = s_elapsed[min(int(0.99 * s_total), s_total - 1)]
        by_sampler[lbl] = {
            "total": s_total,
            "passed": s_passed,
            "failed": s_failed,
            "err_pct": round(s_err_pct, 2),
            "avg": round(s_avg, 2),
            "min": s_elapsed[0],
            "max": s_elapsed[-1],
            "p95": s_p95,
            "p99": s_p99
        }

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
        "by_sampler": by_sampler
    }

def run_stage(threads, loop_count, rampup, stage_label, run_dir):
    stage_name = f"{stage_label}_{threads}_users"
    stage_dir = os.path.join(run_dir, stage_name)
    os.makedirs(stage_dir, exist_ok=True)

    jtl_file = os.path.join(stage_dir, "results.jtl")
    html_dir = os.path.join(stage_dir, "html_report")
    log_file = os.path.join(stage_dir, "jmeter.log")
    jmx_plan = os.path.abspath("load_test_plan.jmx")

    pid = get_backend_pid()

    print(f"\n==================================================")
    print(f"🔥 EXECUTION STAGE: {stage_name.upper()}")
    print(f"⚙️ Threads: {threads} | Loops: {loop_count} | Ramp-Up: {rampup}s")
    print(f"📍 Output Directory: {stage_dir}")
    print(f"==================================================")

    cmd = [
        "jmeter", "-n",
        "-t", jmx_plan,
        f"-Jthreads={threads}",
        f"-JloopCount={loop_count}",
        f"-Jrampup={rampup}",
        "-l", jtl_file,
        "-j", log_file,
        "-e", "-o", html_dir
    ]

    cmd_str = " ".join(cmd)
    print(f"💻 Executing: {cmd_str}\n")
    sys.stdout.flush()

    start_time = time.time()
    proc = subprocess.Popen(cmd_str, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

    peak_cpu = 0.0
    peak_rss = 0.0

    while True:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        if line:
            print(line, end="")
            sys.stdout.flush()

        usage = get_resource_usage(pid)
        if usage["cpu"] > peak_cpu:
            peak_cpu = usage["cpu"]
        if usage["rss_mb"] > peak_rss:
            peak_rss = usage["rss_mb"]

    rc = proc.poll()
    end_time = time.time()
    duration = round(end_time - start_time, 2)

    stats = parse_jtl(jtl_file)

    print(f"\n📌 STAGE RESULT [{stage_name}]:")
    print(f"  • Exit Code: {rc}")
    print(f"  • Duration: {duration}s")
    print(f"  • Peak CPU: {peak_cpu}% | Peak RSS: {peak_rss} MB")
    if stats:
        print(f"  • Requests: {stats['total']} Total | {stats['passed']} Passed | {stats['failed']} Failed ({stats['err_pct']}%)")
        print(f"  • Response Times: Avg {stats['avg']}ms | P50 {stats['p50']}ms | P95 {stats['p95']}ms | P99 {stats['p99']}ms | Max {stats['max']}ms")
        print(f"  • Throughput: {stats['throughput']} req/s")

    return {
        "stage": stage_name,
        "threads": threads,
        "loops": loop_count,
        "rampup": rampup,
        "duration": duration,
        "exit_code": rc,
        "peak_cpu": peak_cpu,
        "peak_rss": peak_rss,
        "stats": stats
    }

def main():
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = os.path.abspath(f"jmeter_full_suite_{timestamp}")
    os.makedirs(run_dir, exist_ok=True)

    print(f"==================================================")
    print(f"🚀 FINANCIAL AUTOMATION PLATFORM LOAD TEST SUITE")
    print(f"📅 Timestamp: {timestamp}")
    print(f"📍 Root Run Dir: {run_dir}")
    print(f"==================================================")

    stages = [
        # Baseline Stages (Phase 6)
        {"threads": 5, "loops": 2, "rampup": 1, "label": "baseline"},
        {"threads": 10, "loops": 3, "rampup": 2, "label": "baseline"},
        {"threads": 25, "loops": 4, "rampup": 5, "label": "baseline"},
        # Controlled Load Stages (Phase 7 & 13)
        {"threads": 50, "loops": 5, "rampup": 10, "label": "load"},
        {"threads": 100, "loops": 5, "rampup": 15, "label": "load"},
        {"threads": 200, "loops": 4, "rampup": 20, "label": "stress"},
        {"threads": 300, "loops": 3, "rampup": 25, "label": "stress"},
        {"threads": 500, "loops": 2, "rampup": 30, "label": "stress"},
        # Soak Test Stage (Phase 14)
        {"threads": 50, "loops": 15, "rampup": 10, "label": "soak"}
    ]

    all_results = []
    for s in stages:
        res = run_stage(s["threads"], s["loops"], s["rampup"], s["label"], run_dir)
        all_results.append(res)
        time.sleep(2)

    summary_file = os.path.join(run_dir, "full_suite_summary.json")
    with open(summary_file, "w") as f:
        json.dump(all_results, f, indent=2)

    print(f"\n==================================================")
    print(f"🏆 ALL JMETER TEST STAGES COMPLETED!")
    print(f"📄 Full Summary Saved to: {summary_file}")
    print(f"==================================================")

if __name__ == "__main__":
    main()
