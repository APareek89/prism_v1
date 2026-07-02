// app/page.tsx
//
// `/` redirects to the default view (/function).

import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/config/constants';

export default function HomePage() {
  redirect(ROUTES.function);
}
