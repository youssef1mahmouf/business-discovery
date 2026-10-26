p='index.html'
s=open(p,encoding='utf-8').read()
old='if (!/^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$/.test(email))'
new='if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))'
assert old in s, 'old not found'
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('done')
