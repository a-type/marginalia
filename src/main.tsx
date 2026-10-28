import { RouterProvider } from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';

import { getRouter } from './router';

import '@a-type/ui/main.css';
import './styles.css';

const router = getRouter();

createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
);
