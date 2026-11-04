# GeoWork professional landing page

A responsive React landing-page component using a green + charcoal visual system. It includes a marketing hero, dashboard illustration, features, setup steps, tenant-security messaging, FAQ, CTA, and contact-interest form UI.

## Add to an existing Vite React frontend

1. Copy `src/LandingPage.jsx` and `src/LandingPage.css` into your frontend's `src/` directory.
2. In your existing router, render the page for `/` and pass the actual route paths for login and company registration. Example for React Router:

```jsx
import LandingPage from './LandingPage';

<Route path="/" element={<LandingPage loginUrl="/login" registerUrl="/register" />} />
```

3. Confirm that `/login` and `/register` match the real routes in your app. If your current routes differ, change the props accordingly.
4. Run `npm run dev` and check desktop and mobile layouts.

## Important before production

- This is a drop-in page component, not an edit to your local repository and not a deployed site.
- The login and registration links are configurable, but the routes must already exist and company registration must be implemented by your backend.
- The contact form currently provides front-end confirmation only; connect it to a real API or CRM before publishing.
- The dashboard illustration uses placeholder dashes and sample UI, not live data.
- Ensure tenant isolation and role permissions are enforced server-side for every protected API endpoint.
- Google Fonts are imported from Google Fonts; provide local fonts if your deployment needs to work without that external service.
