import io
p='src/routes/auth.js'
lines=io.open(p,encoding='utf-8').read().split('\n')
out=[]
# Skip lines 113-114 (index 112-113) which contain the duplicate role+token
for i in range(len(lines)):
    if i==112 or i==113:
        continue
    out.append(lines[i])
io.open(p,'w',encoding='utf-8').write('\n'.join(out))
print('done')
