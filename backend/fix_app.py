import os
p = 'src/app.js'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()
old = "const headers = securityHeaders(ctx.config);\n  if (req.method !== 'OPTIONS') {"
new = "const headers = securityHeaders(config);\n  if (req.method !== 'OPTIONS') {"
if old in c:
    c = c.replace(old, new)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(c)
    print('fixed')
else:
    print('pattern not found')