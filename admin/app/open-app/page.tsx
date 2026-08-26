import { OpenAppClient } from './OpenAppClient';

export const metadata = { title: 'Opening the app…' };
export const dynamic = 'force-static';

export default function OpenAppPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next =
    typeof searchParams.next === 'string' && searchParams.next.startsWith('/')
      ? searchParams.next
      : '/';
  return <OpenAppClient next={next} />;
}
