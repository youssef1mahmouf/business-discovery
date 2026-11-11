import io
p='src/routes/auth.js'
lines=io.open(p,encoding='utf-8').read().split('\n')
out=[]
skip_until=0
for i in range(len(lines)):
    line=lines[i]
    # Remove duplicate token function calls (lines 113-129, indices 112-128)
    # Keep the first occurrence (index 105-111), skip the rest
    if i >= 112 and i <= 129:
        if i >= 112 and i <= 121:
            continue
        if i >= 122 and i <= 129:
            continue
    out.append(line)
io.open(p,'w',encoding='utf-8').write('\n'.join(out))
print('done')
