import React, { useState } from 'react';
import './LandingPage.css';

const features = [
  { icon: '⌖', title: 'GPS workforce visibility', text: 'See field-team locations and work-area activity from one central view.' },
  { icon: '✓', title: 'Reliable attendance', text: 'Keep shift, check-in and check-out records organised in one place.' },
  { icon: '▦', title: 'Work-area management', text: 'Set up work locations and make it easier to coordinate teams.' },
  { icon: '↗', title: 'Actionable reports', text: 'Turn attendance and workforce activity into useful operational insights.' },
  { icon: '♙', title: 'Team administration', text: 'Manage employees and access based on each person’s role.' },
  { icon: '◈', title: 'Company data separation', text: 'Designed for multiple companies, with access controlled by company and role.' },
];

const faqs = [
  ['Who can use GeoWork?', 'GeoWork is designed for businesses that need to coordinate employees, attendance and field teams.'],
  ['Can my company register online?', 'Yes. Use Register your company to begin the company-owner registration flow. The registration button must be connected to your live backend route before launch.'],
  ['Can employees see another company’s data?', 'They should not. The backend must enforce company-level access controls on every protected endpoint; hiding information in the interface alone is not sufficient.'],
  ['Does GeoWork support GPS tracking?', 'The platform is designed for workforce location visibility. Tracking availability depends on your configured mobile app, permissions and backend.'],
];

function Mark() {
  return <span className="gw-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 4C14.6 4 7 11.5 7 20.8c0 12 17 23.2 17 23.2s17-11.2 17-23.2C41 11.5 33.4 4 24 4Z" fill="currentColor"/><circle cx="24" cy="17" r="5" fill="#fff"/><path d="M14.5 31c.8-5 4.5-8 9.5-8s8.7 3 9.5 8" fill="#fff" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/><circle cx="5" cy="10" r="3" fill="#a3e635"/><circle cx="43" cy="10" r="3" fill="#a3e635"/><path d="M8 11.5 13 15M40 11.5 35 15" stroke="#a3e635" strokeWidth="2"/></svg></span>;
}

function DashboardPreview() {
  return <div className="preview-shell" aria-label="Illustration of a workforce dashboard">
    <div className="preview-top"><div className="preview-brand"><Mark/><span>GeoWork</span></div><span className="preview-live"><i/> Live overview</span><div className="preview-avatar">AD</div></div>
    <div className="preview-body"><aside className="preview-sidebar"><span className="side-active">▦ &nbsp; Overview</span><span>⌖ &nbsp; Live map</span><span>✓ &nbsp; Attendance</span><span>♙ &nbsp; Employees</span><span>▤ &nbsp; Reports</span></aside>
      <div className="preview-main"><div className="preview-heading"><div><small>MONDAY, WORKSPACE OVERVIEW</small><h3>Good morning, Admin</h3></div><span className="preview-date">Today ▾</span></div>
        <div className="stat-grid"><div className="stat-card"><small>Present today</small><strong>—</strong><span>Attendance data</span></div><div className="stat-card"><small>Field employees</small><strong>—</strong><span>Live team status</span></div><div className="stat-card"><small>Active work areas</small><strong>—</strong><span>Configured locations</span></div></div>
        <div className="map-card"><div className="map-copy"><small>WORKFORCE LOCATIONS</small><strong>Team activity map</strong><span>Location data appears when your workspace is connected.</span></div><div className="map-art"><div className="map-road road-one"/><div className="map-road road-two"/><div className="map-road road-three"/><span className="map-pin pin-one">●</span><span className="map-pin pin-two">●</span><span className="map-pin pin-three">●</span><span className="map-area">WORK AREA</span></div></div>
      </div>
    </div>
  </div>;
}

export default function LandingPage({ loginUrl = '/login', registerUrl = '/register' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [email, setEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const goTo = (id) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); setMenuOpen(false); };
  const submitContact = (e) => { e.preventDefault(); setEmailMessage(`Thanks. Please contact ${email} with GeoWork information when your enquiry form is connected.`); };

  return <div className="gw-site">
    <div className="gw-announcement"><span>WORKFORCE MANAGEMENT, MADE CLEAR</span><span className="announce-dot">●</span><span>One workspace for your people and operations</span></div>
    <header className="gw-header"><a href="#home" className="gw-logo" aria-label="GeoWork home"><Mark/><span>Geo<span>Work</span></span></a>
      <button className="gw-menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      <nav className={menuOpen ? 'gw-nav is-open' : 'gw-nav'}><a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a><a className="gw-nav-login" href={loginUrl}>Log in</a><a className="gw-button gw-button-small" href={registerUrl}>Register your company <span>↗</span></a></nav>
    </header>
    <main>
      <section className="gw-hero" id="home"><div className="gw-hero-copy"><div className="gw-eyebrow"><span className="eyebrow-pulse"/> WORKFORCE INTELLIGENCE PLATFORM</div><h1>Your workforce.<br/><span>Connected.</span> Everywhere.</h1><p className="gw-hero-lead">Bring attendance, field teams and work locations together in one clear view. Give your people the tools to work better—and your business the visibility to move forward.</p><div className="gw-hero-actions"><a className="gw-button" href={registerUrl}>Get started <span>↗</span></a><a className="gw-button gw-button-quiet" href={loginUrl}>Already have an account? <strong>Log in</strong></a></div><div className="gw-trust-note"><span className="trust-check">✓</span> Built for teams that work in the field and beyond</div></div>
        <div className="gw-hero-visual"><div className="visual-glow"/><DashboardPreview/><div className="floating-note note-attendance"><span className="float-icon green">✓</span><span><b>Attendance, organised</b><small>One place for shift records</small></span></div><div className="floating-note note-location"><span className="float-icon dark">⌖</span><span><b>Know your work areas</b><small>Team visibility at a glance</small></span></div></div>
      </section>
      <section className="gw-benefit-strip"><div><span className="benefit-icon">⌖</span><span><b>Location visibility</b><small>Coordinate field teams</small></span></div><div><span className="benefit-icon">✓</span><span><b>Attendance records</b><small>Keep shifts organised</small></span></div><div><span className="benefit-icon">▤</span><span><b>Operational insights</b><small>Make informed decisions</small></span></div><div><span className="benefit-icon">♙</span><span><b>Team management</b><small>Roles and people in one place</small></span></div></section>
      <section className="gw-section gw-features" id="features"><div className="gw-section-heading"><div className="gw-eyebrow">ONE PLATFORM. CLEARER OPERATIONS.</div><h2>Everything your team needs<br/>to <span>stay in sync.</span></h2><p>Bring everyday workforce tasks into one practical workspace—built to support growing teams.</p></div><div className="gw-feature-grid">{features.map((f, i) => <article className="gw-feature-card" key={f.title}><div className="feature-symbol">{f.icon}</div><span className="feature-index">0{i + 1}</span><h3>{f.title}</h3><p>{f.text}</p><a href={registerUrl} aria-label={`Get started with ${f.title}`}>Explore GeoWork <span>↗</span></a></article>)}</div></section>
      <section className="gw-how" id="how-it-works"><div className="gw-how-copy"><div className="gw-eyebrow">A SIMPLE WAY TO GET STARTED</div><h2>From registration<br/>to <span>ready to work.</span></h2><p>Set up your company workspace, invite your team and configure the tools your operation needs.</p><a className="gw-button" href={registerUrl}>Register your company <span>↗</span></a></div><div className="gw-steps"><article><span>01</span><div><h3>Create your workspace</h3><p>Register your company and set up the owner account.</p></div></article><article><span>02</span><div><h3>Set up your team</h3><p>Configure employees, roles, shifts and work areas.</p></div></article><article><span>03</span><div><h3>Manage in one place</h3><p>Use your workspace to review attendance and team activity.</p></div></article></div></section>
      <section className="gw-security"><div className="security-emblem"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 5 53 13v16c0 14-9 24-21 30C20 53 11 43 11 29V13Z" fill="none" stroke="currentColor" strokeWidth="3"/><path d="m21 31 7 7 15-16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div><div><div className="gw-eyebrow">BUILT WITH RESPONSIBLE ACCESS IN MIND</div><h2>Every company deserves<br/>its own <span>space.</span></h2><p>GeoWork is designed for company-based workspaces and role-aware access. Production deployments must enforce tenant isolation and permissions in the backend—not just in the interface.</p></div><a href="#faq" className="gw-text-link">Learn more <span>↗</span></a></section>
      <section className="gw-section gw-faq" id="faq"><div className="gw-section-heading"><div className="gw-eyebrow">QUESTIONS, ANSWERED</div><h2>Good to know.</h2><p>A few things to help you get started with GeoWork.</p></div><div className="gw-faq-list">{faqs.map(([q, a], i) => <div className="gw-faq-item" key={q}><button aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? -1 : i)}><span>{q}</span><b>{openFaq === i ? '−' : '+'}</b></button>{openFaq === i && <p>{a}</p>}</div>)}</div></section>
      <section className="gw-cta"><div className="cta-orbit orbit-one"/><div className="cta-orbit orbit-two"/><div className="gw-eyebrow">MAKE YOUR NEXT WORKDAY CLEARER</div><h2>Bring your workforce<br/>into <span>one view.</span></h2><p>Create a GeoWork company workspace to get started.</p><div className="gw-hero-actions"><a className="gw-button gw-button-light" href={registerUrl}>Register your company <span>↗</span></a><a className="gw-cta-login" href={loginUrl}>Already registered? Log in</a></div></section>
      <section className="gw-contact"><div><div className="gw-eyebrow">LET'S TALK</div><h2>Want to learn more<br/>about <span>GeoWork?</span></h2><p>Leave your email to indicate interest. Connect this form to your contact or CRM endpoint before publishing.</p></div><form onSubmit={submitContact} className="gw-contact-form"><label htmlFor="gw-email">Work email</label><div className="contact-input-row"><input id="gw-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setEmailMessage(''); }} placeholder="you@company.com" required/><button type="submit" aria-label="Submit email">→</button></div><small>{emailMessage || 'No spam. Just information about GeoWork.'}</small></form></section>
    </main>
    <footer className="gw-footer"><a href="#home" className="gw-logo"><Mark/><span>Geo<span>Work</span></span></a><p>Workforce clarity for teams on the move.</p><div className="footer-links"><a href="#features">Features</a><a href="#faq">FAQ</a><a href={loginUrl}>Login</a><a href={registerUrl}>Register</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} GeoWork. All rights reserved.</span><span>Workforce management platform</span></div></footer>
  </div>;
}
