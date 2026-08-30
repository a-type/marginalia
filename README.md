Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
pnpm install
pnpm run dev
```

Copy `.env.example` to `.env` and set `SESSION_PASSWORD`. Local ATProto OAuth expects the app at
`http://127.0.0.1:3000`; open that address rather than `localhost`.

# Building For Production

To build this application for production:

```bash
npm run build
```

## Linting & Formatting

This project uses [eslint](https://eslint.org/) and [prettier](https://prettier.io/) for linting and formatting. Eslint is configured using [tanstack/eslint-config](https://tanstack.com/config/latest/docs/eslint). The following scripts are available:

```bash
npm run lint
npm run format
npm run check
```

## Deploy to Railway

Railway's Railpack builder detects the project's package manager and package
scripts automatically.

1. Push this repo to GitHub
2. Visit https://railway.com/new and create a project from your repo
3. In the **Variables** tab, add the entries from `.env.example` with their production values
4. Deploy, then open **Networking** and select **Generate Domain**

Railpack runs the project's build script and starts the generated Nitro server
with `node .output/server/index.mjs`. The server handles SSR, server functions,
API routes, and static assets.

For ATProto login, set `APP_URL` to the generated public HTTPS origin and set a
unique `SESSION_PASSWORD` of at least 32 characters. The app exposes its OAuth
client metadata at `/oauth-client-metadata.json` and persists accounts, OAuth
state, and OAuth sessions in SQLite. Set `DATABASE_PATH` to a persistent volume
path when deploying to Railway.

## ATProto Tap Webhook

The app accepts Tap webhook events at `/api/tap/webhook` and persists records for
the local lexicons:

- `com.marginalia.commentary`
- `com.marginalia.annotation`

Run Tap in webhook mode with collection filters for the app lexicons:

```bash
TAP_WEBHOOK_URL="$APP_URL/api/tap/webhook" \
TAP_COLLECTION_FILTERS="com.marginalia.commentary,com.marginalia.annotation" \
TAP_ADMIN_PASSWORD="$TAP_ADMIN_PASSWORD" \
tap run --no-replay
```

When `TAP_ADMIN_PASSWORD` is set in the app environment, the webhook endpoint
requires Tap's Basic auth header. Add repos to Tap with its admin API to trigger
backfill and live delivery:

```bash
curl -u "admin:$TAP_ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"dids":["did:plc:..."]}' \
  http://127.0.0.1:2480/repos/add
```

# Paraglide i18n

This add-on wires up ParaglideJS for localized routing and message formatting.

- Messages live in `project.inlang/messages`.
- URLs are localized through the Paraglide Vite plugin and router `rewrite` hooks.
- Run the dev server or build to regenerate the `src/paraglide` outputs.

## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from '@tanstack/react-router'
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')

  useEffect(() => {
    getServerTime().then(setTime)
  }, [])

  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
