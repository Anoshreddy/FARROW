FARROW – Digital Raw Material Visibility and Live Inventory Management System
Tagline: Built for Smarter Inventory

FARROW is a web-based inventory management project designed to improve the visibility and tracking of food-industry raw materials across multiple warehouses. The application brings raw-material records, warehouse information, inventory batches, expiry details, stock movements, demand forecasts, stockout-risk indicators, reorder recommendations, reports, and alerts into one interface.
Project type: B.Tech capstone project / academic prototype
Important: Forecasts and risk indicators are decision-support estimates. Their reliability depends on the quality, coverage, and recency of the available data.

Project Objectives
1. Provide centralized, web-based inventory management.
2. Improve visibility into raw-material quantities, warehouse locations, batches, and expiry information.
3. Track receiving, consumption, transfers, and wastage.
4. Generate reports for inventory, expiry, consumption, and warehouse operations.
5. Use machine-learning-based demand forecasting to support stockout-risk assessment and replenishment decisions.
Features
Module	Description
Dashboard	Provides an overview of inventory and operational information.
Raw Materials	Maintains raw-material records.
Warehouses	Manages warehouse information.
Inventory	Displays stock across materials and warehouses.
Batches & Expiry	Tracks batch-level stock and expiry information.
Stock Movements	Records receiving, consumption, wastage, and stock transfers.
Demand Forecast	Estimates future raw-material consumption from historical data.
Stockout Risk	Displays stockout-risk indicators.
Reorder Recommendations	Helps identify materials that may require replenishment.
Reports	Provides inventory and operational reports.
Alerts	Displays relevant inventory, expiry, and stock-related alerts.


Feature behaviour should be verified against the implementation. A visible interface alone does not establish that every workflow has been fully validated.
Technology Stack
- Frontend: React, Vite
- Backend: Python, Flask
- Database: SQLite with SQLAlchemy
- Machine Learning: scikit-learn (Gradient Boosting Regressor)
- Data Processing: Pandas, NumPy
- Model Persistence: Joblib
Check the project dependency files for the exact package versions.
Project Structure
The main project directories include:
FARROW/
├── backend/
│   └── app.py
├── frontend/
│   ├── package.json
│   └── ...
├── README.md
├── CONTRIBUTING.md
└── .gitignore
The exact folder and file structure may vary depending on the project version.
Prerequisites
Install the following:
- Python 3
- Node.js and npm
- Git
Verify the installations:
py --version
node --version
npm --version
git --version
Installation and Setup
Run the backend and frontend in two separate terminals.
1. Start the Backend
Open Terminal 1:
cd "C:\Users\anosh\Downloads\FARROW_fixed\Digital Raw Material Inventory System"
py backend\app.py
Keep this terminal running.

If Python reports a missing dependency, install the packages listed in the backend dependency file included in the repository. Do not guess package versions.
2. Start the Frontend
Open Terminal 2:
cd "C:\Users\anosh\Downloads\FARROW_fixed\Digital Raw Material Inventory System\frontend"
npm install
npm run dev
Open the local URL printed by Vite in the terminal. It is commonly http://localhost:5173, but use the actual URL displayed by your application.
3. Stop the Application
Press Ctrl + C in each terminal to stop the backend and frontend servers.
Suggested Demonstration Workflow
1. Open the Dashboard.
2. Review Raw Materials and Warehouses.
3. Inspect Inventory and Batches & Expiry.
4. Record a stock movement such as receiving, consumption, wastage, or transfer.
5. Verify the movement history and resulting inventory quantities.
6. Generate a Demand Forecast.
7. Review Stockout Risk and Reorder Recommendations.
8. Open Reports and Alerts.
Use the project's demonstration data and verify the selected material, warehouse, batch, quantity, and unit before recording a stock movement.
Machine Learning Notes
The forecasting component estimates raw-material consumption using historical data. A forecast is an estimate, not a guarantee of future demand.

Interpret evaluation metrics in the context of the dataset and the evaluation method. Metrics such as MAE, RMSE, and MAPE should be reported with their test-data context. MAPE should not be described as model accuracy.

If synthetic or simulated data is used, disclose that clearly. Do not present simulated results as validation on live company operations.
Team Members
Team Member	University ID	Role
Muchatla Anoshreddy	ENG23AM0157	Team Lead
Nunna Sai Vamshi	ENG23AM0165	Team Member
Mopuru Rama Charan	ENG23AM0155	Team Member
Paruchuri Devamshu	ENG23AM0171	Team Member


Department: Computer Science and Engineering (AI & ML)
Institution: School of Engineering, Dayananda Sagar University
Academic Year: 2025–2026
Team Contributions
The project work was divided across development, research, requirements, testing, documentation, and presentation activities. The summaries below describe the team's reported areas of responsibility.
Team Member	Role	Contribution Summary
Muchatla Anoshreddy	Team Lead / Full-Stack Development	Coordinated overall project development; worked on frontend and backend implementation, database integration, machine-learning integration, inventory management, stock-movement functionality, and system integration.
Nunna Sai Vamshi	Research and Literature Survey	Worked on identifying relevant research papers, preparing the literature survey, analysing related approaches, and organising research references.
Mopuru Rama Charan	Requirements and Testing	Worked on requirement analysis, inventory workflow planning, functional testing, and validation of application modules.
Paruchuri Devamshu	Documentation and UI Review	Worked on project documentation, user-interface review, application screenshots, diagrams, and presentation preparation.


These descriptions should reflect work actually completed by each member.
GitHub Collaboration and Contribution Recognition
The repository owner can invite team members as collaborators through Settings → Collaborators. Accepting an invitation grants repository access; it does not automatically add that person to GitHub's Contributors graph.

GitHub attributes contributions based on its contribution-counting rules. To be recognised in the repository's Contributors graph, a member generally needs an eligible commit attributed to their GitHub account. The commit's author email must be associated with and verified on that account, and the commit must meet GitHub's repository and branch eligibility rules.

The README's Team Members and Team Contributions sections provide a written record of the team's roles. They cannot substitute for eligible Git commits or force names to appear in the Contributors graph.
Limitations and Responsible Use
- FARROW is an academic prototype and should not be treated as a production inventory or procurement system without further testing and operational controls.
- Forecast quality depends on the availability, quality, and recency of historical data.
- Users should verify stock quantities, units, supplier lead times, and business constraints before acting on recommendations.
- Do not commit passwords, API keys, access tokens, personal information, or confidential company data.
- Do not commit a local database file unless the team has confirmed that it contains no sensitive information and is required for the demonstration. If demo data is needed, document a safe database initialization or seed-data process.
License
No license is currently specified. Unless a license is added, normal copyright restrictions apply and others do not automatically receive permission to reuse or redistribute this project.
