import os, json, pandas as pd, re

DATA_DIR  = os.path.join(os.path.dirname(__file__), "data", "uploads")
JSON_PATH = os.path.join(DATA_DIR, "ACN-data.json")
CSV_PATH  = os.path.join(DATA_DIR, "ACN-data.csv")

def load_partial_json(path):
    """Read text and keep only complete JSON objects inside _items."""
    txt = open(path, "r", encoding="utf-8", errors="ignore").read()

    # Find the _items list start
    m = re.search(r'"_items"\s*:\s*\[', txt)
    if not m:
        raise ValueError("Cannot find '_items' in file.")
    start = m.end()

    # Find where file ends cleanly (last full object closing brace)
    cutoff = txt.rfind("}")
    # take a safe chunk ending with ]
    safe = txt[:cutoff + 1] + "]"
    # Wrap in minimal valid dict
    json_text = '{"_items": ' + safe[start:] + "}"

    # Try to parse
    try:
        return json.loads(json_text)
    except Exception as e:
        # As fallback, keep only well-formed objects using regex
        objs = re.findall(r"\{[^\{\}]*?\}", json_text)
        items = []
        for o in objs:
            try:
                items.append(json.loads(o))
            except Exception:
                break
        return {"_items": items}

print("Reading:", JSON_PATH)
payload = load_partial_json(JSON_PATH)
items = payload.get("_items", [])
print(f"✅ Loaded {len(items)} complete items")

# ---- Flatten ----
df = pd.json_normalize(items, sep=".")

# ---- Optional: add meta if present ----
if isinstance(payload, dict) and "_meta" in payload:
    meta = payload["_meta"]
    if isinstance(meta, dict):
        for k, v in meta.items():
            df[f"_meta.{k}"] = v

# ---- Save ----
os.makedirs(DATA_DIR, exist_ok=True)
df.to_csv(CSV_PATH, index=False, encoding="utf-8")
print(f"✅ Flattened CSV saved to {CSV_PATH}")
print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
