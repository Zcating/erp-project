import { Link } from "@tanstack/react-router";
import type { BreadcrumbChain } from "@/lib/route-breadcrumbs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

export function RouteBreadcrumb({ chain }: { chain: BreadcrumbChain }) {
  return (
    <Breadcrumb className="mb-2">
      <BreadcrumbList>
        {chain.ancestors.map((ancestor) => (
          <BreadcrumbItem key={ancestor.to}>
            <BreadcrumbLink asChild>
              <Link to={ancestor.to}>{ancestor.label}</Link>
            </BreadcrumbLink>
            <BreadcrumbSeparator />
          </BreadcrumbItem>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{chain.current.label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
