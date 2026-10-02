import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/health')({
  component: RouteComponent,
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  },
});

function RouteComponent() {
  return <div>I'm alive!</div>;
}
