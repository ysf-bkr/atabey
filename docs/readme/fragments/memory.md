## 3-Layer Memory System

| Layer | Storage | Technology | Purpose |
|-------|---------|------------|---------|
| **Vector Memory** | SQLite | TF-IDF / OpenAI embeddings + cosine similarity | Semantic search across project knowledge |
| **Project Memory** | Markdown | `PROJECT_MEMORY.md` | Central project state, synchronized every session |
| **Specialty Memory** | Markdown | `.atabey/memory/specialties/{agent}.md` | Per-agent learned conventions from past tasks |

```
Task → Evaluation Engine → Score (0-100)
  ├── Success → extractSuccessLesson() → updateSpecialtyMemory()
  └── Failure → compliance/lint/test lesson → updateSpecialtyMemory()
       ↓
  Next session: readLearnedConventions() → injected into agent prompt
```
