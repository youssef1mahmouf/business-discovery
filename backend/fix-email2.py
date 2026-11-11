import io
p='src/routes/auth.js'
c=io.open(p,encoding='utf-8').read()
# Find both occurrences of the email declaration in the password-recovery route
first=c.find('    const email = String(body.email || ')
second=c.find('    const email = String(body.email || ', first+1)
if second>0:
    # Remove the second occurrence: find the newline after the second email line
    newline_idx=c.find('\n', second)
    c=c[:second]+c[newline_idx:]
    io.open(p,'w',encoding='utf-8').write(c)
    print('removed duplicate email')
else:
    print('not found')
