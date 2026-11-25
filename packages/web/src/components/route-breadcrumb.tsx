import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
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
          <Fragment key={ancestor.to}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={ancestor.to}>{ancestor.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{chain.current.label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
