export default function NotFound() {
  return (
    <html lang="en"><body style={{ margin:0, fontFamily:'system-ui', background:'#f9fafb' }}>
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 1rem' }}>
        <h1 style={{ fontSize:'5rem', fontWeight:700, color:'#e5e7eb', margin:'0 0 1rem' }}>404</h1>
        <p style={{ color:'#6b7280', marginBottom:'1.5rem' }}>Page not found.</p>
        <a href="/en/dashboard" style={{ background:'#1E3A8A', color:'#fff', padding:'0.5rem 1.25rem', borderRadius:'0.5rem', textDecoration:'none' }}>Go to dashboard</a>
      </div>
    </body></html>
  );
}
