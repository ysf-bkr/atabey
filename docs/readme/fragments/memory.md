## 3-Layer Memory System

| Layer | Storage | Technology | Purpose |
|-------|---------|------------|---------|
| **Vector Memory** | SQLite | Local TF-IDF embeddings (cosine similarity); optional OpenAI `text-embedding-3-small` when `OPENAI_API_KEY` is set | Semantic search across project knowledge |
| **Project Memory** | Markdown | `PROJECT_MEMORY.md` | Central project state, synchronized every session |
| **Specialty Memory** | Markdown | `.atabey/memory/specialties/{agent}.md` | Per-agent learned conventions from past tasks |

> **Local by default, not unconditionally local:** if you configure `OPENAI_API_KEY`,
> embedding requests send the embedded text to the OpenAI API. Without a key, Atabey stays
> on-machine and falls back to the local TF-IDF vectorizer (384-dim, zero-padded to 1536 for
> storage).
>
> **Providers are not interchangeable.** OpenAI and TF-IDF vectors live in different semantic
> spaces, so Atabey tags every stored vector with its provider and never scores across
> providers. After switching the key on or off, re-index (`atabey index`) to get comparable
> results; entries from the other provider are skipped rather than ranked with meaningless
> similarity scores.
