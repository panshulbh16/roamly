import sqlite3,re,pathlib,unittest
class StorageTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for p in sorted(pathlib.Path('drizzle').glob('*.sql')): self.db.executescript(p.read_text())
 def test_request_reservations_stop_at_limit(self):
  code=pathlib.Path('lib/server/planner.ts').read_text()
  q=re.findall(r'prepare\(\s*"([^"]+)"\s*,?\s*\)' ,code)[0]
  for limit in (5,20):
   with self.subTest(limit=limit):
    owner=f'user:limit{limit}:today'
    values=[self.db.execute(q,(owner,limit)).fetchone() for _ in range(limit+3)]
    self.assertEqual(sum(v is not None for v in values),limit)
    self.assertEqual(self.db.execute(q,(owner,limit)).fetchone(),None)
  self.assertEqual(self.db.execute(q,('user:b:today',5)).fetchone(),(1,))
 def test_save_is_owner_scoped_and_upsert_works_at_capacity(self):
  code=pathlib.Path('app/api/trips/route.ts').read_text()
  q=next(q for q in re.findall(r'prepare\(\s*"([^"]+)"\s*,?\s*\)' ,code) if q.startswith('INSERT'))
  def save(i,u,p):return self.db.execute(q,(i,u,p,'2026-09-07',u,i,u)).fetchone()
  self.assertEqual(save('trip','alice','private'),('trip',))
  self.assertIsNone(save('trip','bob','stolen'))
  self.assertEqual(self.db.execute('SELECT payload FROM trips WHERE id=?',('trip',)).fetchone(),('private',))
  for i in range(99):save(str(i),'alice','x')
  self.assertIsNone(save('overflow','alice','x'))
  self.assertEqual(save('trip','alice','edited'),('trip',))
 def test_collection_query_uses_owner_index(self):
  plan=str(self.db.execute('EXPLAIN QUERY PLAN SELECT payload FROM trips WHERE owner=? ORDER BY created_at DESC LIMIT 100',('alice',)).fetchall())
  self.assertIn('idx_trips_owner_created',plan)
if __name__=='__main__':unittest.main()
