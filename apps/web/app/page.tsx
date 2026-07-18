// app/page.tsx
//
// `/` redirects to the highest-scope view the signed-in role may access.

import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/config/constants';
import { getAuthUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/roles';

export default async function HomePage() {
  const user = await getAuthUser();
  redirect(user && !can(user, 'view_function_aggregates') ? ROUTES.me : ROUTES.function);
}
