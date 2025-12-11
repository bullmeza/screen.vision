# Screen Vision

Try for free at [screen.vision](https://screen.vision)

https://github.com/user-attachments/assets/c84fc58d-5dc0-4997-85dd-81dad27f9089

## Models Used

| Model             | Provider   | Purpose                                                                                |
| ----------------- | ---------- | -------------------------------------------------------------------------------------- |
| **GPT-5 Mini**    | OpenAI     | Primary reasoning: generates step-by-step instructions and answers follow-up questions |
| **Qwen3-VL 235B** | OpenRouter | Step verification: compares before/after screenshots to confirm action completion      |
| **Qwen3-VL 30B**  | OpenRouter | Coordinate detection: locates specific UI elements on screen                           |

## Privacy & Security

Privacy is our top priority. Screen Vision is designed to process your data securely without retaining it.

- **Zero Data Retention**: No images or screen recordings are stored on the server. All processing happens in real-time, and data is discarded immediately after analysis.
- **Secure AI Processing**: Screenshots are sent to trusted LLM providers (OpenAI and Fireworks AI) solely for analysis. These providers adhere to strict data handling policies and do not store or use your data to train their models.
  - [OpenAI Enterprise Privacy](https://platform.openai.com/docs/guides/your-data)
  - [Fireworks AI Data Handling Policy](https://docs.fireworks.ai/guides/security_compliance/data_handling)

## How It Works

The system is straightforward:

1. **You describe your goal** — "I want to set up two-factor authentication on my Google account" or "Help me configure my Git SSH keys"

2. **You share your screen** — The app uses your browser's built-in screen sharing (the same tech used for video calls)

3. **AI analyzes what it sees** — Vision language models look at your screen and figure out the current state

4. **You get one instruction at a time** — No information overload. Just "Click the blue Settings button in the top right" or "Scroll down to find Security"

5. **Automatic progress detection** — When you complete a step, Screen Vision notices the screen changed and automatically gives you the next instruction

**Frontend (Next.js + React)**

- Handles screen capture via the MediaDevices API
- Runs change detection by comparing scaled-down frames
- Manages the PiP window for always-on-top instructions
- Masks its own window from screenshots (so the AI doesn't see itself)

**Backend (FastAPI + Python)**

- `/api/step` — Given a goal and screenshot, returns the next single instruction
- `/api/check` — Compares before/after screenshots to verify if a step was completed
- `/api/help` — Answers follow-up questions about what's on screen
- `/api/coordinates` — Locates specific UI elements when needed

## Self-Hosting

### Prerequisites

- Node.js 18+
- Python 3.10+
- pnpm (or npm/yarn)

### Installation

Clone the repo and install dependencies:

```bash
git clone https://github.com/bullmeza/screen-vision.git
cd screen-vision

# Frontend
pnpm install

# Backend
pip install -r requirements.txt
```

### Configuration

Create a `.env.local` file in the root directory:

```bash
# Required - powers the main step-by-step logic
OPENAI_API_KEY=sk-...

# Required - used for verification and coordinate detection (Qwen models)
OPENROUTER_API_KEY=sk-or-...
```

The app uses OpenAI for primary reasoning and OpenRouter to access Qwen-VL models for specific tasks like step verification. You can swap these out by modifying `api/index.py` if you prefer different providers.

### Running Locally

Start both the frontend and backend with a single command:

```bash
npm run dev
```

This runs:

- Next.js dev server on `http://localhost:3000`
- FastAPI server on `http://localhost:8000`

Open your browser to `http://localhost:3000` and you're good to go.

### Running in Production

For production deployments:

```bash
# Build the frontend
npm run build

# Start the frontend
npm run start

# Run the API separately
uvicorn api.index:app --host 0.0.0.0 --port 8000
```

Or use the included `Procfile` for platforms like Railway or Heroku.

## Tech Stack

- **Frontend**: Next.js 13, React 18, Tailwind CSS, Zustand
- **Backend**: FastAPI, Python
- **AI**: OpenAI GPT models, Qwen-VL (via OpenRouter)
- **UI**: Radix primitives, Framer Motion, Lucide icons
