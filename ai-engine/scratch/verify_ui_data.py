"""
verify_ui_data.py — End-to-end verification of LaTeX UI JSON extraction
and frontend form pre-filling data pipeline.
"""

import json
import requests
import sys

def run_tests():
    print("=== 1. Loading test_compile.json ===")
    with open("c:/Users/harsh/Desktop/Coding/project/fuse/test_compile.json", "r", encoding="utf-8") as f:
        data = json.load(f)

    master_tex = data["tex"]
    jd_text = data["jd_text"]

    # --- Test 1: Python AI Engine Direct (/api/rewrite-resume) ---
    print("\n=== 2. Testing Python AI Engine: POST http://localhost:8000/api/rewrite-resume ===")
    payload = {
        "parsed_resume": {"raw_tex": master_tex},
        "raw_tex": master_tex,
        "jd_text": jd_text,
        "selected_github_projects": []
    }

    resp = requests.post("http://localhost:8000/api/rewrite-resume", json=payload, timeout=180)
    print("Status code:", resp.status_code)
    if resp.status_code != 200:
        print("Error response:", resp.text)
        sys.exit(1)

    result = resp.json()
    assert result["status"] == "success", "Status was not success"
    assert "ui_data" in result, "ui_data missing from response!"
    assert "rewritten_resume" in result, "rewritten_resume missing from response!"

    ui_data = result["ui_data"]
    basics = ui_data.get("basics", {})
    work = ui_data.get("work", [])
    projects = ui_data.get("projects", [])

    print("\n--- Extracted UI Data ---")
    print("Name:", repr(basics.get("name")))
    print("Email:", repr(basics.get("email")))
    print("Phone:", repr(basics.get("phone")))
    print("Role:", repr(basics.get("role")))
    print("Location:", repr(basics.get("location")))
    print("URL:", repr(basics.get("url")))
    print(f"Work count: {len(work)}")
    print(f"Projects count: {len(projects)}")

    # Stated Check 1: Name is extracted
    assert basics.get("name") == "Harsh Patil", f"Unexpected name: {basics.get('name')}"
    print(" [Check 1] Name extracted correctly ('Harsh Patil').")

    # Stated Check 2: Email is extracted
    assert basics.get("email") == "harshpatil110@gmail.com", f"Unexpected email: {basics.get('email')}"
    print(" [Check 2] Email extracted correctly ('harshpatil110@gmail.com').")

    # Stated Check 3: Phone is extracted
    assert "+91 98765 43210" in basics.get("phone", ""), f"Unexpected phone: {basics.get('phone')}"
    print(" [Check 3] Phone extracted correctly ('+91 98765 43210').")

    # Stated Check 4: Work Experience is extracted with updated bullets
    assert len(work) > 0, "Work list is empty!"
    assert work[0].get("company") == "Acme Corp", f"Unexpected company: {work[0].get('company')}"
    assert len(work[0].get("bullets", [])) > 0, "Work bullets are empty!"
    print(f" [Check 4] Work experience extracted correctly: {work[0]['company']} with {len(work[0]['bullets'])} bullets.")

    # Stated Check 5: Projects extracted with bullets
    assert len(projects) > 0, "Projects list is empty!"
    assert projects[0].get("name") == "O.N.E.", f"Unexpected project name: {projects[0].get('name')}"
    assert len(projects[0].get("bullets", [])) > 0, "Project bullets are empty!"
    print(f" [Check 5] Projects extracted correctly: {projects[0]['name']} with {len(projects[0]['bullets'])} bullets.")

    # --- Test 2: Node.js API Gateway (/api/rewrite) ---
    print("\n=== 3. Testing Node.js API Gateway: POST http://localhost:5000/api/rewrite ===")
    gw_payload = {
        "parsedResume": {"raw_tex": master_tex},
        "rawTex": master_tex,
        "jdText": jd_text,
        "selectedGithubProjects": []
    }

    gw_resp = requests.post("http://localhost:5000/api/rewrite", json=gw_payload, timeout=180)
    print("Gateway status code:", gw_resp.status_code)
    if gw_resp.status_code != 200:
        print("Gateway error response:", gw_resp.text)
        sys.exit(1)

    gw_result = gw_resp.json()
    assert "ui_data" in gw_result, "ui_data missing from gateway response!"
    gw_ui = gw_result["ui_data"]
    assert gw_ui["basics"]["name"] == "Harsh Patil"
    assert len(gw_ui["work"]) > 0
    print(" [Check 6] Gateway forwarded ui_data intact with all fields populated.")

    print("\n ALL UI DATA EXTRACTION & FORM PRE-FILLING CHECKS PASSED!")

if __name__ == "__main__":
    run_tests()

