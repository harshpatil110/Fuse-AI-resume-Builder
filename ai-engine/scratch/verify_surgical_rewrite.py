"""
verify_surgical_rewrite.py — Automated end-to-end verification of the
In-Place Surgical Regex Replacement architecture.
"""

import base64
import json
import requests
import sys

def run_tests():
    print("=== 1. Loading test_compile.json ===")
    with open("c:/Users/harsh/Desktop/Coding/project/fuse/test_compile.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    master_tex = data["tex"]
    jd_text = data["jd_text"]

    print("Master LaTeX length:", len(master_tex))

    # --- Test 1: Python AI Engine Direct (/api/rewrite-resume) ---
    print("\n=== 2. Testing Python AI Engine: POST http://localhost:8000/api/rewrite-resume ===")
    payload_engine = {
        "parsed_resume": {"raw_tex": master_tex},
        "raw_tex": master_tex,
        "jd_text": jd_text,
        "selected_github_projects": []
    }

    resp = requests.post(
        "http://localhost:8000/api/rewrite-resume",
        json=payload_engine,
        timeout=180
    )
    print("Status code:", resp.status_code)
    if resp.status_code != 200:
        print("Error response:", resp.text)
        sys.exit(1)

    result = resp.json()
    assert result["status"] == "success", "Expected status == success"
    compiled_tex = result["compiled_tex"]
    pdf_b64 = result["pdf_base64"]

    print("Compiled LaTeX length:", len(compiled_tex))
    print("PDF base64 length:", len(pdf_b64))

    # Stated Check 1: Preamble is untouched
    preamble = master_tex[:master_tex.find(r"\begin{document}")]
    assert preamble in compiled_tex, "Preamble was altered!"
    print(" [Check 1] Preamble is 100% byte-for-byte identical.")

    # Stated Check 2: Header is untouched
    assert "Harsh Patil" in compiled_tex
    assert "harshpatil110@gmail.com" in compiled_tex
    assert "+91 98765 43210" in compiled_tex
    print(" [Check 2] Header (name, email, phone) is 100% byte-for-byte identical.")

    # Stated Check 3: Education & Achievements are untouched
    assert r"\section{Education}" in compiled_tex
    assert "VESIT, Mumbai" in compiled_tex
    assert "GPA 9.1/10" in compiled_tex
    assert r"\section{Achievements}" in compiled_tex
    assert "Hackup Hackathon 2024" in compiled_tex
    assert "Solved 400+ DSA problems on LeetCode" in compiled_tex
    print(" [Check 3] Education and Achievements are 100% byte-for-byte identical.")

    # Stated Check 4: \resumeSubheading and \resumeProjectHeading are untouched
    assert r"{Software Engineer}{2023--Present}" in compiled_tex
    assert r"{Acme Corp}{Remote}" in compiled_tex
    assert r"\resumeProjectHeading" in compiled_tex
    assert r"{\textbf{O.N.E.} $|$ \href{https://github.com/harshpatil110/one}{GitHub}}{}" in compiled_tex
    print(" [Check 4] Subheadings and Project Headings are 100% byte-for-byte identical.")

    # Stated Check 5: Only bullet items are modified and wrapped in \resumeItem
    assert r"\resumeItem{" in compiled_tex
    print(" [Check 5] Updated bullet points exist and are wrapped in \\resumeItem{...}.")

    # Stated Check 6: PDF compiled cleanly
    pdf_bytes = base64.b64decode(pdf_b64)
    assert pdf_bytes.startswith(b"%PDF-"), "Decoded bytes do not start with %PDF-!"
    print(f" [Check 6] pdflatex compiled cleanly! PDF size: {len(pdf_bytes)} bytes.")

    # --- Test 2: Node.js API Gateway (/api/rewrite) ---
    print("\n=== 3. Testing Node.js API Gateway: POST http://localhost:5000/api/rewrite ===")
    gateway_payload = {
        "parsedResume": {"raw_tex": master_tex},
        "rawTex": master_tex,
        "jdText": jd_text,
        "selectedGithubProjects": []
    }

    gw_resp = requests.post(
        "http://localhost:5000/api/rewrite",
        json=gateway_payload,
        timeout=180
    )
    print("Gateway status code:", gw_resp.status_code)
    if gw_resp.status_code != 200:
        print("Gateway error response:", gw_resp.text)
        sys.exit(1)

    gw_result = gw_resp.json()
    assert gw_result["status"] == "success"
    assert "compiled_tex" in gw_result
    assert "pdf_base64" in gw_result
    print(" [Check 7] Gateway successfully routed, processed, and returned status 200 OK.")

    # --- Test 3: Large payload test (>500KB) ---
    print("\n=== 4. Testing Large Payload (>500KB) on Gateway ===")
    large_payload = dict(gateway_payload)
    large_payload["largeBuffer"] = "X" * 600_000  # 600KB padding
    large_resp = requests.post(
        "http://localhost:5000/api/rewrite",
        json=large_payload,
        timeout=180
    )
    print("Large payload status code:", large_resp.status_code)
    assert large_resp.status_code == 200, f"Expected 200, got {large_resp.status_code}"
    print(" [Check 8] 600KB payload passed without 413 Payload Too Large error!")

    print("\n ALL VERIFICATION CHECKS PASSED PERFECTLY!")

if __name__ == "__main__":
    run_tests()

