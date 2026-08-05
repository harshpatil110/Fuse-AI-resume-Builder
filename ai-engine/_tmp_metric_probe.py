"""Temp probe: verify validator LaTeX normalization + pure-digit comparison."""
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("validator", "validator.py")
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)

# Exact false-positive case from the task (raw LaTeX in original).
orig = r"Achieved $\sim$60\% throughput improvement and reduced latency by 70\%, with 99\% accuracy across 30 services."
gen = "Achieved 60% throughput improvement and reduced latency by 70%, with 99% accuracy across 30 services."

print("normalize(orig):", repr(v.normalize_metric_text(orig)))
print("numbers(orig)  :", v.extract_numbers(v.normalize_metric_text(orig)))
print("numbers(gen)   :", v.extract_numbers(v.normalize_metric_text(gen)))
print("integrity(orig,gen)  ->", v.verify_metrics_integrity(orig, gen))

print()
gen2 = "Achieved 60% throughput improvement and 45% cost reduction."
print("fabrication(45%)      ->", v.verify_metrics_integrity(orig, gen2))
print("2,000 vs 2000         ->", v.verify_metrics_integrity("saw 2,000 users", "saw 2000 users"))
print("50K vs 50000          ->", v.verify_metrics_integrity("scaled to 50K", "scaled to 50000"))
print("1st ordinal           ->", v.verify_metrics_integrity("ranked 1st", "ranked 1"))
print("plus/minus/tilde      ->", v.verify_metrics_integrity(r"5-10 req/s, $\pm$2", "5 10 req/s, 2"))
print()
# Negative control: a genuinely invented value must still be flagged.
orig3 = r"Scored 30\% on baseline."
print("new value 45%         ->", v.verify_metrics_integrity(orig3, "Scored 45%"))
print("same value 30%        ->", v.verify_metrics_integrity(orig3, "Scored 30%"))
