cd ai-engine
venv/scripts/activate
uvicorn main:app --reload --port 8000


cd api-gateway
npm run dev 

cd frontend

npm run dev
