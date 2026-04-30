#!/usr/bin/env python3
"""
Gemini CLI Environment Scanner
===============================
Scans ~/.gemini/ and ~/.claude/ directories to discover patterns, catalog
configurations, and suggest reusable skills from conversation history.

Auth: Set GOOGLE_API_KEY env var, or set GOOGLE_CLOUD_PROJECT for Vertex AI.
"""

import argparse
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Redaction helpers
# ---------------------------------------------------------------------------
SECRET_RX = [
    re.compile(r'AIza[0-9A-Za-z\-_]{35}'),
    re.compile(r'ya29\.[0-9A-Za-z\-_]+'),
    re.compile(r'sk-[a-zA-Z0-9]{20,}'),
    re.compile(r'ghp_[a-zA-Z0-9]{36}'),
    re.compile(r'xox[baprs]-[a-zA-Z0-9\-]+'),
]
SENSITIVE_KEYS = {'api_key','apiKey','token','secret','password','credential',
                  'Authorization','X-Goog-Api-Key','x-api-key'}

def _redact(key: str, val: str) -> str:
    if any(k.lower() in key.lower() for k in SENSITIVE_KEYS):
        return f"[REDACTED-{len(val)}chars]"
    for rx in SECRET_RX:
        if rx.search(str(val)):
            return f"[REDACTED-{len(val)}chars]"
    return val

def redact_dict(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):   out[k] = redact_dict(v)
        elif isinstance(v, list): out[k] = [redact_dict(i) if isinstance(i,dict) else _redact(k,i) if isinstance(i,str) else i for i in v]
        elif isinstance(v, str):  out[k] = _redact(k, v)
        else:                     out[k] = v
    return out

# ---------------------------------------------------------------------------
# Scanners
# ---------------------------------------------------------------------------
def scan_settings(gdir: Path) -> dict:
    p = gdir / "settings.json"
    if not p.exists(): return {"found": False}
    raw = json.loads(p.read_text())
    return {
        "found": True,
        "mcp_servers": redact_dict(raw.get("mcpServers", {})),
        "model": raw.get("model", {}),
        "experimental": raw.get("experimental", {}),
        "auth_type": raw.get("security",{}).get("auth",{}).get("selectedType"),
        "agents_config": raw.get("agents", {}),
    }

def scan_gemini_md(gdir: Path) -> dict:
    p = gdir / "GEMINI.md"
    if not p.exists(): return {"found": False}
    content = p.read_text()
    return {
        "found": True,
        "word_count": len(content.split()),
        "sections": re.findall(r'^#+\s+(.+)$', content, re.MULTILINE),
        "content": content,
    }

def scan_skills(gdir: Path) -> list:
    sdir = gdir / "skills"
    if not sdir.exists(): return []
    skills = []
    for d in sdir.iterdir():
        if not d.is_dir() or d.name.startswith('.'): continue
        sm = d / "SKILL.md"
        info = {"name": d.name, "source": "gemini", "has_skill_md": sm.exists()}
        if sm.exists():
            content = sm.read_text()
            fm = re.match(r'^---\s*\n(.+?)\n---', content, re.DOTALL)
            if fm:
                for line in fm.group(1).split('\n'):
                    if ':' in line:
                        k, v = line.split(':', 1)
                        info[k.strip()] = v.strip()
            info["file_count"] = sum(1 for _ in d.rglob('*') if _.is_file())
        skills.append(info)
    return skills

def scan_agents(gdir: Path) -> list:
    """Scan .gemini/agents/ and extension agents."""
    agents = []
    for search_dir in [gdir / "agents", *(gdir / "extensions").glob("*/agents")]:
        if not search_dir.exists(): continue
        for f in search_dir.glob("*.md"):
            content = f.read_text()
            info = {"name": f.stem, "source": str(search_dir.relative_to(gdir)), "path": str(f)}
            fm = re.match(r'^---\s*\n(.+?)\n---', content, re.DOTALL)
            if fm:
                for line in fm.group(1).split('\n'):
                    if ':' in line:
                        k, v = line.split(':', 1)
                        info[k.strip()] = v.strip()
            agents.append(info)
    return agents

def scan_extensions(gdir: Path) -> dict:
    edir = gdir / "extensions"
    if not edir.exists(): return {"found": False, "extensions": []}
    exts = [d.name for d in edir.iterdir() if d.is_dir() and not d.name.startswith('.')]
    enablement = {}
    ep = edir / "extension-enablement.json"
    if ep.exists():
        raw = json.loads(ep.read_text())
        for n, c in raw.items():
            overrides = c.get("overrides", [])
            enablement[n] = {"enabled": not any(o.startswith('!') for o in overrides)}
    return {"found": True, "extensions": exts, "enablement": enablement}

def scan_policies(gdir: Path) -> dict:
    pdir = gdir / "policies"
    if not pdir.exists(): return {"found": False}
    return {"found": True, "files": {f.name: f.read_text() for f in pdir.glob("*.toml")}}

def scan_claude(home: Path) -> dict:
    """Scan ~/.claude/ for skills and CLAUDE.md files."""
    cdir = home / ".claude"
    if not cdir.exists(): return {"found": False}
    result = {"found": True, "skills": [], "claude_mds": []}
    # Skills
    sdir = cdir / "skills"
    if sdir.exists():
        for d in sdir.iterdir():
            if not d.is_dir(): continue
            sm = d / "SKILL.md"
            info = {"name": d.name, "source": "claude", "has_skill_md": sm.exists()}
            if sm.exists():
                content = sm.read_text()
                fm = re.match(r'^---\s*\n(.+?)\n---', content, re.DOTALL)
                if fm:
                    for line in fm.group(1).split('\n'):
                        if ':' in line:
                            k, v = line.split(':', 1)
                            info[k.strip()] = v.strip()
            result["skills"].append(info)
    # CLAUDE.md in projects
    for cmd_file in (home / ".claude").rglob("CLAUDE.md"):
        content = cmd_file.read_text()
        result["claude_mds"].append({
            "path": str(cmd_file),
            "word_count": len(content.split()),
            "sections": re.findall(r'^#+\s+(.+)$', content, re.MULTILINE),
        })
    return result

def scan_conversations(gdir: Path) -> dict:
    """Parse conversation JSONLs from ~/.gemini/tmp/"""
    tmp = gdir / "tmp"
    if not tmp.exists(): return {"found": False}

    tool_usage = Counter()
    models = Counter()
    topics = []
    user_prompts = []
    total_sessions = 0
    total_tokens = {"input": 0, "output": 0, "cached": 0, "thoughts": 0}
    project_activity = {}
    earliest, latest = None, None

    for pdir in tmp.iterdir():
        if not pdir.is_dir() or pdir.name.startswith('.'): continue
        pname = pdir.name
        chats = pdir / "chats"
        logs = pdir / "logs.json"
        ptool = Counter()
        psess = 0

        if logs.exists():
            try:
                for e in json.loads(logs.read_text()):
                    if e.get("type") == "user":
                        msg = e.get("message", "")
                        if msg and not msg.startswith('/'):
                            user_prompts.append({"project": pname, "timestamp": e.get("timestamp",""), "text": msg[:300]})
            except Exception: pass

        if chats and chats.exists():
            for jf in chats.glob("session-*.jsonl"):
                total_sessions += 1; psess += 1
                try:
                    for line in jf.open():
                        line = line.strip()
                        if not line: continue
                        try: d = json.loads(line)
                        except: continue
                        ts = d.get("timestamp")
                        if ts:
                            if earliest is None or ts < earliest: earliest = ts
                            if latest is None or ts > latest: latest = ts
                        for tc in d.get("toolCalls", []):
                            n = tc.get("name","unknown")
                            tool_usage[n] += 1; ptool[n] += 1
                        if d.get("type") == "gemini" and "model" in d:
                            models[d["model"]] += 1
                        for t in d.get("thoughts", []):
                            s = t.get("subject","")
                            if s: topics.append(s)
                        if "tokens" in d:
                            for k in total_tokens:
                                total_tokens[k] += d["tokens"].get(k, 0)
                except Exception: pass
        project_activity[pname] = {"sessions": psess, "top_tools": dict(ptool.most_common(10))}

    return {
        "found": True,
        "total_sessions": total_sessions,
        "timespan": {"earliest": earliest, "latest": latest},
        "projects": project_activity,
        "tool_usage_top_20": dict(tool_usage.most_common(20)),
        "models_used": dict(models),
        "thought_topics_top_15": dict(Counter(topics).most_common(15)),
        "total_tokens": total_tokens,
        "user_prompt_count": len(user_prompts),
        "user_prompts": user_prompts,
    }

def scan_project_gemini_mds(gdir: Path) -> list:
    results = []
    projects_path = gdir / "projects.json"
    paths = set()
    if projects_path.exists():
        try:
            data = json.loads(projects_path.read_text())
            if isinstance(data, list):
                for p in data: paths.add(p.get("path","") or p.get("projectRoot",""))
            elif isinstance(data, dict):
                for v in data.values():
                    if isinstance(v, dict): paths.add(v.get("path","") or v.get("projectRoot",""))
        except: pass
    tmp = gdir / "tmp"
    if tmp.exists():
        for pr in tmp.rglob(".project_root"):
            try: paths.add(pr.read_text().strip())
            except: pass
    for pp in paths:
        if not pp: continue
        p = Path(pp)
        for gmd in [p / "GEMINI.md"] + list((p / ".gemini").rglob("GEMINI.md")) if (p / ".gemini").exists() else [p / "GEMINI.md"]:
            if gmd.exists():
                c = gmd.read_text()
                results.append({"project": p.name, "path": str(gmd), "word_count": len(c.split()),
                                "sections": re.findall(r'^#+\s+(.+)$', c, re.MULTILINE)})
    return results

# ---------------------------------------------------------------------------
# Sophistication score
# ---------------------------------------------------------------------------
def compute_score(m: dict) -> dict:
    s = {}
    s["mcp_servers"]    = min(len(m.get("settings",{}).get("mcp_servers",{})) * 5, 20)
    s["skills"]         = min(len(m.get("skills",[])) * 3, 15)
    s["extensions"]     = min(len(m.get("extensions",{}).get("extensions",[])) * 2, 15)
    gmd = m.get("global_gemini_md",{})
    s["global_context"] = min(int(gmd.get("word_count",0) / 50), 10) if gmd.get("found") else 0
    s["project_context"]= min(len(m.get("project_gemini_mds",[])) * 3, 10)
    s["policies"]       = 5 if m.get("policies",{}).get("found") else 0
    s["tool_diversity"]  = min(len(m.get("conversations",{}).get("tool_usage_top_20",{})) * 2, 15)
    s["session_volume"]  = min(int(m.get("conversations",{}).get("total_sessions",0) / 2), 10)
    # Bonus for Claude Code cross-pollination
    claude = m.get("claude",{})
    if claude.get("found"):
        s["claude_skills"] = min(len(claude.get("skills",[])), 5)
    return {"total": sum(s.values()), "max": 105, "breakdown": s}

# ---------------------------------------------------------------------------
# Gemini API: Suggest skills from conversation patterns
# ---------------------------------------------------------------------------
def suggest_skills(manifest: dict, api_key: str = None, project: str = None) -> list:
    """Use Gemini to analyze conversation patterns and suggest skill creation."""
    try:
        import google.generativeai as genai
    except ImportError:
        print("  ⚠ google-generativeai not installed, skipping skill suggestions")
        return []

    if api_key:
        genai.configure(api_key=api_key)
    elif project:
        genai.configure()  # Uses ADC
    else:
        print("  ⚠ No API key or project set, skipping skill suggestions")
        return []

    # Build a summary of conversation patterns for the prompt
    convos = manifest.get("conversations", {})
    prompts = convos.get("user_prompts", [])[:40]  # Cap to control token cost
    tools = convos.get("tool_usage_top_20", {})
    topics = convos.get("thought_topics_top_15", {})
    existing_skills = [s.get("name","") for s in manifest.get("skills",[])]
    claude_skills = [s.get("name","") for s in manifest.get("claude",{}).get("skills",[])]

    prompt_text = f"""You are analyzing a developer's Gemini CLI usage patterns to suggest reusable agent skills they should create.

## Existing Skills (already installed)
Gemini: {json.dumps(existing_skills)}
Claude Code: {json.dumps(claude_skills)}

## Top Tools Used
{json.dumps(tools, indent=2)}

## Top Thought Topics
{json.dumps(topics, indent=2)}

## Sample User Prompts (chronological)
{json.dumps([p["text"] for p in prompts], indent=2)}

## Task
Based on the patterns above, suggest 3-5 NEW reusable skills this user should create.
For each skill, provide:
1. A short `name` (kebab-case, e.g. "gke-troubleshooter")
2. A `description` (one line)
3. `rationale` - why this pattern deserves a skill (what repeating pattern you detected)
4. `skill_template` - a brief SKILL.md template (YAML frontmatter + 5-10 lines of instructions)

Do NOT suggest skills that duplicate existing ones.
Focus on patterns the user does REPEATEDLY — those are the best candidates for automation.

Return valid JSON array of objects with keys: name, description, rationale, skill_template"""

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(prompt_text)
        text = response.text.strip()
        # Extract JSON from response
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        return json.loads(text)
    except Exception as e:
        print(f"  ⚠ Skill suggestion failed: {e}")
        return []

# ---------------------------------------------------------------------------
# Markdown report generator
# ---------------------------------------------------------------------------
def generate_report(m: dict) -> str:
    L = []
    L.append("# Gemini CLI Environment Scan Report")
    L.append(f"\n**Scan Date:** {m['scan_timestamp']}")
    score = m["sophistication_score"]
    L.append(f"\n## Sophistication Score: {score['total']}/{score['max']}\n")
    L.append("| Category | Score |")
    L.append("|:---|---:|")
    for k, v in score["breakdown"].items():
        L.append(f"| {k.replace('_',' ').title()} | {v} |")

    # MCP
    mcp = m.get("settings",{}).get("mcp_servers",{})
    L.append(f"\n## MCP Servers ({len(mcp)})\n")
    for n, c in mcp.items():
        L.append(f"- **{n}** — `{c.get('command','N/A')}`")

    # Skills (combined)
    skills = m.get("skills",[])
    L.append(f"\n## Gemini Skills ({len(skills)})\n")
    for s in skills:
        L.append(f"- **{s['name']}** — {s.get('description','')}")

    # Claude skills
    claude = m.get("claude",{})
    if claude.get("found"):
        cs = claude.get("skills",[])
        L.append(f"\n## Claude Code Skills ({len(cs)})\n")
        for s in cs:
            L.append(f"- **{s['name']}** — {s.get('description','')}")

    # Agents
    agents = m.get("agents",[])
    if agents:
        L.append(f"\n## Custom Agents ({len(agents)})\n")
        for a in agents:
            L.append(f"- **{a['name']}** ({a['source']}) — {a.get('description','')}")

    # Extensions
    ext = m.get("extensions",{})
    L.append(f"\n## Extensions ({len(ext.get('extensions',[]))})\n")
    for e in ext.get("extensions",[]):
        en = ext.get("enablement",{}).get(e,{})
        L.append(f"- {'✅' if en.get('enabled',True) else '❌'} **{e}**")

    # Conversations
    convos = m.get("conversations",{})
    if convos.get("found"):
        L.append(f"\n## Conversation Intelligence\n")
        L.append(f"- **Sessions:** {convos['total_sessions']}")
        ts = convos.get("timespan",{})
        if ts.get("earliest"):
            L.append(f"- **Timespan:** {ts['earliest'][:10]} → {ts['latest'][:10]}")
        tok = convos.get("total_tokens",{})
        L.append(f"- **Total Tokens:** {sum(tok.values()):,}\n")
        L.append("### Top Tools\n| Tool | Calls |\n|:---|---:|")
        for t, c in sorted(convos.get("tool_usage_top_20",{}).items(), key=lambda x: x[1], reverse=True):
            L.append(f"| `{t}` | {c} |")
        L.append("\n### Models Used\n")
        for mo, c in convos.get("models_used",{}).items():
            L.append(f"- `{mo}`: {c} turns")

    # Suggested skills
    suggestions = m.get("suggested_skills",[])
    if suggestions:
        L.append(f"\n## 💡 Suggested Skills ({len(suggestions)})\n")
        L.append("These skills were identified by analyzing your conversation patterns.\n")
        for s in suggestions:
            L.append(f"### `{s.get('name','')}`\n")
            L.append(f"**Description:** {s.get('description','')}\n")
            L.append(f"**Rationale:** {s.get('rationale','')}\n")
            tmpl = s.get("skill_template","")
            if tmpl:
                L.append(f"```markdown\n{tmpl}\n```\n")

    L.append("\n---\n*Generated by gemini-cli-scanner. Review before sharing.*")
    return "\n".join(L)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Scan Gemini CLI & Claude Code environments.")
    parser.add_argument("--gemini-dir", default=os.path.expanduser("~/.gemini"))
    parser.add_argument("--home-dir", default=os.path.expanduser("~"))
    parser.add_argument("--output-dir", default="./scan-results")
    parser.add_argument("--skip-suggestions", action="store_true", help="Skip Gemini API skill suggestions")
    parser.add_argument("--json-only", action="store_true")
    args = parser.parse_args()

    gdir = Path(args.gemini_dir)
    home = Path(args.home_dir)
    outdir = Path(args.output_dir)

    if not gdir.exists():
        print(f"Error: {gdir} not found", file=sys.stderr); sys.exit(1)

    print(f"🔍 Scanning {gdir}...")
    m = {"scan_timestamp": datetime.now().isoformat(), "gemini_dir": str(gdir), "version": "2.0.0"}

    print("  → Settings & MCP servers..."); m["settings"] = scan_settings(gdir)
    print("  → Global GEMINI.md...");       m["global_gemini_md"] = scan_gemini_md(gdir)
    print("  → Gemini skills...");          m["skills"] = scan_skills(gdir)
    print("  → Custom agents...");          m["agents"] = scan_agents(gdir)
    print("  → Extensions...");             m["extensions"] = scan_extensions(gdir)
    print("  → Policies...");               m["policies"] = scan_policies(gdir)
    print("  → Claude Code (~/.claude)...");m["claude"] = scan_claude(home)
    print("  → Conversations...");          m["conversations"] = scan_conversations(gdir)
    print("  → Project GEMINI.md files..."); m["project_gemini_mds"] = scan_project_gemini_mds(gdir)

    m["sophistication_score"] = compute_score(m)

    if not args.skip_suggestions:
        print("  → Suggesting skills (Gemini API)...")
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        project = os.environ.get("GOOGLE_CLOUD_PROJECT")
        m["suggested_skills"] = suggest_skills(m, api_key=api_key, project=project)
    else:
        m["suggested_skills"] = []

    outdir.mkdir(parents=True, exist_ok=True)
    jp = outdir / "gemini-env-manifest.json"
    jp.write_text(json.dumps(m, indent=2, default=str))
    print(f"\n✅ JSON manifest: {jp}")

    if not args.json_only:
        mp = outdir / "gemini-env-report.md"
        mp.write_text(generate_report(m))
        print(f"✅ Markdown report: {mp}")

    print(f"\n📊 Score: {m['sophistication_score']['total']}/{m['sophistication_score']['max']}")

if __name__ == "__main__":
    main()
