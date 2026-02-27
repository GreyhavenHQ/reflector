import NextLink from "next/link";
import { featureEnabled } from "../lib/features";
import UserInfo from "../(auth)/userInfo";
import { RECORD_A_MEETING_URL } from "../api/urls";

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <NextLink href={href} className="font-light px-10">
      {children}
    </NextLink>
  );
}

export default function MainNav() {
  return (
    <nav>
      <NavLink href={RECORD_A_MEETING_URL}>Create</NavLink>
      {featureEnabled("browse") && (
        <>
          &nbsp;·&nbsp;
          <NavLink href="/browse">Browse</NavLink>
        </>
      )}
      {featureEnabled("rooms") && (
        <>
          &nbsp;·&nbsp;
          <NavLink href="/rooms">Rooms</NavLink>
        </>
      )}
      {featureEnabled("requireLogin") && (
        <>
          &nbsp;·&nbsp;
          <NavLink href="/settings/api-keys">Settings</NavLink>
          &nbsp;·&nbsp;
          <UserInfo />
        </>
      )}
    </nav>
  );
}
