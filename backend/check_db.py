import sqlite3
conn = sqlite3.connect('loomiq.db')
c = conn.cursor()
c.execute("SELECT username, role, is_active FROM users LIMIT 10")
users = c.fetchall()
print("Users:", users)
conn.close()
