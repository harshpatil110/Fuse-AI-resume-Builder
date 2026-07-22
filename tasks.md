# Project Fuse: Development Tasks (Phase 1)

## Phase 1: Infrastructure, Database & API Gateway

**Task 1: Monorepo Setup & Service Initialization**
* Initialize a root directory for `Fuse`.
* Create two distinct sub-directories: `api-gateway` (Node.js) and `ai-engine` (Python).
* Set up a virtual environment in `ai-engine`, copy over the existing `hiring-agent` repository files, and install dependencies from `requirements.txt`[cite: 2].

**Task 2: Database Provisioning & Drizzle ORM Setup**
* Provision a new PostgreSQL instance on Neon DB.
* Initialize Drizzle ORM within the `api-gateway` service.
* Define the initial database schemas (e.g., `Users`, `Resumes`, `JobDescriptions`, `GitHubProfiles`) using JavaScript.
* Run the first Drizzle push to synchronize the schema with Neon DB.

**Task 3: GitHub OAuth Integration**
* Register a new OAuth application in your GitHub Developer Settings.
* Create login and callback routes in the Node.js `api-gateway` to handle the OAuth 2.0 flow.
* Securely store the returned user access tokens in the Neon database for later API calls.

**Task 4: API Gateway File Upload Handling**
* Implement a `multer` (or similar) middleware in the Node.js service to accept PDF resume uploads and JD text/file uploads.
* Create a temporary storage mechanism for these files before they are streamed to the Python AI engine.

**Task 5: Python FastAPI Microservice Shell**
* In the `ai-engine` directory, create a `main.py` file to initialize a FastAPI application.
* Expose a `/process-resume` POST endpoint that accepts the uploaded PDF (like the `resume/sample.pdf`[cite: 2]) and JD data from the Node.js gateway.

**Task 6: Refactoring the PDF Extractor**
* Modify `pdf.py` and `pymupdf_rag.py`[cite: 2] within the FastAPI service to return structured JSON data (e.g., extracted text chunks) via HTTP response, rather than printing to the console or passing directly to a local script.

**Task 7: GitHub Data Fetcher Service**
* Write a utility in the Node.js gateway that uses the stored GitHub OAuth token to fetch the user's  repositories, recent commits, and repository READMEs via the GitHub REST/GraphQL API.
* Format this pulled data into a clean JSON object to be sent alongside the resume to the AI engine.

**Task 8: Nvidia NIM GLM 5.2 LLM Integration**
* Update `config.py` and `llm_utils.py`[cite: 2] in the Python service.
* Replace any legacy OpenAI/Anthropic API calls with the Nvidia NIM endpoint. 
* Securely configure the GLM 5.2 API keys using environment variables.

**Task 9: AI Prompt Restructuring (From Critic to Creator)**
* Overhaul the Jinja templates located in `prompts/templates/`[cite: 2].
* Modify `system_message.jinja` and `resume_evaluation_criteria.jinja`[cite: 2] to change the AI's persona from a "recruiter evaluating a resume" to an "expert career consultant writing a resume."
* Ensure the prompts are instructed to directly merge the extracted GitHub projects with the user's base experience.

**Task 10: Frontend Foundation & Design System**
* Initialize the React frontend application.
* Install and configure Tailwind CSS.
* Establish the core design system: strictly avoid dark mode and neon colors. Configure Tailwind variables for an off-white, paper-like background, structural borders instead of shadows, and high-end, print-inspired typography to give the tool a premium, editorial feel.

## Phase 2: Multi-Agent AI Workflow & Core Logic

**Task 11: The Critic Agent Implementation**
* Create a specific prompt pipeline using the Nvidia NIM GLM 5.2 LLM.
* Pass the extracted resume JSON (from `transform.py`[cite: 2]) and the parsed JD text to the model.
* Instruct the LLM to output a strict structural critique: identifying missing keywords, weak action verbs, and irrelevant experiences that do not map to the JD.

**Task 12: The GitHub Matching Agent**
* Create a semantic matching logic within the Python service.
* Feed the fetched GitHub repositories (passed from the Node.js API gateway) and the parsed JD into the GLM 5.2 model.
* Instruct the LLM to select the top 2-3 repositories that best demonstrate the specific skills requested in the JD, extracting key metrics from the READMEs.

**Task 13: The Writer Agent (Resume Refactoring)**
* Build the core rewrite engine.
* Pass the original resume, the selected GitHub projects, and the JD into the Writer Agent prompt.
* Instruct the LLM to merge the user's base experience with the GitHub data, rewriting bullet points to be quantifiable and explicitly tailored to the JD requirements.

**Task 14: LLM Output Formatting & Validation**
* Ensure the Writer Agent outputs a strictly formatted JSON structure (e.g., using JSON mode or strict schema parsing) representing the finalized resume data.
* Implement error handling and retry logic in case the GLM 5.2 response breaks the required JSON schema.

**Task 15: Quality Assurance (The Grading Loop)**
* Re-integrate the logic from `evaluator.py` and `score.py`[cite: 2].
* Instead of scoring the user's *old* resume, pass the *newly generated* resume JSON back through the evaluator to ensure it hits a high alignment score against the JD. If the score is low, trigger a rewrite loop.

## Phase 3: Frontend Development & UI

**Task 16: React Routing & Dashboard Setup**
* Set up standard React routes (e.g., `/dashboard`, `/upload`, `/editor`, `/settings`).
* Build out the core navigation shell, ensuring seamless transitions between the file upload state and the editing state.

**Task 17: Upload UI & Aesthetic Implementation**
* Build drag-and-drop zones for the JD and Resume.
* Strictly enforce the "Warm Editorial Minimalism" design system via Tailwind CSS: use off-white backgrounds (e.g., `bg-stone-50`), rely entirely on structural borders (`border-gray-300`) to separate components, avoid all drop shadows, and implement high-end serif/sans-serif typography combos.

**Task 18: GitHub Connection UI**
* Create a dedicated settings panel or modal for GitHub OAuth connection.
* Once authenticated, display a visually clean list of the user's fetched repositories, allowing them to manually toggle which ones should be considered by the AI Engine.

**Task 19: AI Feedback Interface**
* Build a split-screen or side-panel view to display the Critic Agent's feedback.
* Highlight specific sections of the user's old resume that need improvement, explaining *why* the AI made the changes it did based on the JD.

**Task 20: The Interactive Resume Editor**
* Develop a rich text editor or form-based UI displaying the final generated resume JSON.
* Allow the user to manually tweak the LLM-generated bullet points, swap out GitHub projects, or adjust phrasing before finalizing the document.

## Phase 4: Document Generation & Deployment

**Task 21: Server-Side PDF Generation**
* In the Node.js API Gateway, integrate a library like `react-pdf` or `Puppeteer`.
* Create a clean, print-ready HTML/React template matching the high-end typography of the UI.
* Map the finalized JSON data into this template and generate a downloadable PDF.

**Task 22: Database History Implementation**
* Finalize Drizzle ORM queries to save the completed resume, the original JD, and the extracted GitHub data to the Neon PostgreSQL database.
* Create a "History" tab on the frontend so users can download or duplicate previously tailored resumes.

**Task 23: End-to-End System Testing**
* Perform full-cycle integration tests: Upload PDF -> Node Gateway -> FastAPI -> Parse -> Fetch Git -> Critic Agent -> Writer Agent -> JSON Return -> Edit UI -> PDF Generation.
* Verify cross-origin resource sharing (CORS) between the React frontend, Node gateway, and FastAPI services.

**Task 24: Dockerization & Container Orchestration**
* Write `Dockerfile`s for all three services: React (Nginx build), Node.js Gateway, and Python FastAPI.
* Write a `docker-compose.yml` file to spin up the entire stack locally for easy development and isolated environment testing.

**Task 25: Cloud Deployment & CI/CD**
* Deploy the PostgreSQL database to Neon DB production.
* Deploy the Node.js and Python microservices to a platform like Render, Railway, or AWS ECS.
* Configure secure environment variables in production (GitHub OAuth Client ID/Secret, Nvidia NIM API Key, Database URIs).




