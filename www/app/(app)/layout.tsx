import { Container, Flex } from "@chakra-ui/react";
import NextLink from "next/link";
import Image from "next/image";
import AuthWrapper from "./AuthWrapper";
import MainNav from "../components/MainNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Container
      minW="100vw"
      maxH="100vh"
      minH="100vh"
      maxW="container.xl"
      display="grid"
      gridTemplateRows="auto minmax(0,1fr)"
    >
      <Flex
        as="header"
        justify="space-between"
        alignItems="center"
        w="100%"
        py="2"
        px="0"
        mt="1"
      >
        {/* Logo on the left */}
        <NextLink href="/" className="flex">
          <Image
            src="/reach.svg"
            width={32}
            height={40}
            className="h-11 w-auto"
            alt="Reflector"
          />
          <div className="hidden flex-col ml-3 md:block">
            <h1 className="text-[28px] font-semibold leading-tight">
              Reflector
            </h1>
            <p className="text-gray-500 text-xs tracking-tight -mt-1">
              Capture the signal, not the noise
            </p>
          </div>
        </NextLink>
        <MainNav />
      </Flex>

      <AuthWrapper>{children}</AuthWrapper>
    </Container>
  );
}
