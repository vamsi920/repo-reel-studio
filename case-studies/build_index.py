"""Render case-studies/site/index.html from site/modules.json."""
import html
import json
import os

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
mods = json.load(open(os.path.join(SITE, "modules.json")))
items = "\n".join(
    f'<li><a href="{html.escape(m["href"])}"><span class="m-title">{html.escape(m["title"])}</span>'
    f'<span class="m-state">{html.escape(m["state"])}</span><p class="m-sum">{html.escape(m["summary"])}</p></a></li>'
    for m in mods
)
tpl = open(os.path.join(SITE, "index.template.html")).read()
open(os.path.join(SITE, "index.html"), "w").write(tpl.replace("<!--MODULES-->", items))
print("built index with", len(mods), "studies")
