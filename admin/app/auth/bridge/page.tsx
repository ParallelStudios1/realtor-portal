import { BridgeClient } from './BridgeClient';

export const metadata = { title: 'Opening your dashboard…' };
export const dynamic = 'force-static';

/** See BridgeClient — tokens ride the URL fragment, handled entirely client-side. */
export default function AuthBridgePage() {
  return <BridgeClient />;
}
