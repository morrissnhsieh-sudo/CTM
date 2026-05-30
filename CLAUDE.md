You are an expert software architect and principal engineer. I am building a collaborative, cloud-based spreadsheet system, and I need you to generate a comprehensive `CLAUDE.md` file for the root of our repository. 

This file will serve as your own development guide, command cheat sheet, and architectural source of truth whenever you work on this codebase.

### Project Context & Core Features:
1. Multi-User Collaboration: Real-time data sync (CRDTs or Operational Transformation) for concurrent spreadsheet editing. Of sourse, the user management is a must.
2. Data Management: Grid-based data storage, formula parsing, and relational or document-based persistence.
3. Message Exchange: Real-time chat, cell-level comments, and notification dispatches.
4. Workflow Control: Status pipelines, row-level approval chains, and automated triggers.
5. Embedded LLM Interface: Natural language querying (Text-to-SQL/Text-to-Formula), automated data analysis, and agentic data management.

### Your Task:
Generate a clean, professional, and highly specific `CLAUDE.md` file using the structure below. Fill in the blanks with the most modern, industry-standard tech stack for this kind of real-time, AI-augmented SaaS (e.g., TypeScript, React/Next.js, Node.js/Go, WebSockets/Socket.io or Liveblocks, PostgreSQL/Redis, and LangChain/Vercel AI SDK for the LLM integration).

---

### [Structure of the requested CLAUDE.md]

# CLAUDE.md - Collaborative AI Spreadsheet System

## 1. System Overview & Architecture
[Provide a brief paragraph describing the high-level architecture. Detail how the frontend connects to the backend, how real-time collaboration is achieved, and where the LLM orchestration layer sits.]

## Project Structure

```
CTM/
  CLAUDE.md             # This file — project contract for Claude
  agents/               # Agent definitions (role, goals, constraints, skills)
  skills/               # Reusable skill definitions and prompts
  memory/               # Persistent state across sessions
    global/             # Shared knowledge for all agents
    episodic/           # Logs of past actions and outcomes
    semantic/           # Long-term reference knowledge
  docs/                 # All project documentation
    architecture/       # System design, data flows, ADRs, integration diagrams
    user-guides/        # How-to guides and workflows for store operators
    reference/          # API refs, data schemas, config options, agent contracts
    marketing/          # Product overviews, solution briefs, competitive positioning
    specs/              # Feature specs (PRDs), SPEC-###-<name>.md
	study/              # Research and study reports
  config/
    system.yaml         # Runtime configuration
  logs/                 # Execution logs
```

## 2. Core Tech Stack
* **Frontend:** [e.g., Next.js, TailwindCSS, shadcn/ui, Canvas/Canvas-based grid or TanStack Table]
* **Backend & Real-time:** [e.g., Node.js/TypeScript, WebSockets, Yjs or Automerge for CRDTs]
* **Database & Cache:** [e.g., PostgreSQL for relational data, Redis for pub/sub and presence]
* **AI Layer:** [e.g., Vercel AI SDK, OpenAI/Anthropic API, LangChain/LangGraph for workflow execution]

## 3. Build, Test, and Run Commands
[Provide the exact CLI commands for standard developer workflows. Assume a monorepo setup if applicable.]
* **Install Dependencies:** `...`
* **Run Development Server:** `...`
* **Production Build:** `...`
* **Run Linter/Formatter:** `...`
* **Run Tests (Unit & End-to-End):** `...`
* **Database Migrations:** `...`

## 4. Code & Architecture Guidelines
* **State Management & Sync:** [Guidelines on how real-time cell state changes must be broadcasted without race conditions.]
* **LLM Interface Security:** [Strict rules regarding prompt injection prevention, data privacy, and sandboxing LLM-generated code/formulas.]
* **Error Handling:** [Standardized error response formats for API endpoints and WebSocket disconnects.]
* **Component & Directory Conventions:** [Define standard patterns, e.g., separating UI components from heavy spreadsheet computation hooks.]

## 5. Typical Workflow Patterns (How-To)
* *To add a new spreadsheet formula:* [Step-by-step guideline]
* *To create a new automated workflow trigger:* [Step-by-step guideline]
* *To expand the LLM's tool-calling capabilities:* [Step-by-step guideline]

---

Please output ONLY the markdown content for `CLAUDE.md`. Do not include conversational filler or meta-commentary outside the markdown block. Make the instructions concrete, production-ready, and tailored specifically to this collaborative AI spreadsheet use case.