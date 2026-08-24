import type { BranchPage, RepositoryPage } from "#/types/git";
import { supabase } from "#/lib/data-platform/client";

const EMPTY_REPOSITORY_PAGE: RepositoryPage = { items: [], next_page_id: null };
const EMPTY_BRANCH_PAGE: BranchPage = { items: [], next_page_id: null };

async function invokeProxy<T>(
  body: Record<string, unknown>,
): Promise<T | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke("github-api-proxy", {
    body,
  });
  if (error) return null;
  return data as T;
}

export async function searchLocalGithubRepositories(args: {
  query?: string;
  limit?: number;
  pageId?: string;
}): Promise<RepositoryPage> {
  const result = await invokeProxy<RepositoryPage>({
    action: "search",
    query: args.query,
    pageId: args.pageId,
  });
  return result ?? EMPTY_REPOSITORY_PAGE;
}

export async function retrieveLocalGithubRepositories(args: {
  pageId?: string;
}): Promise<RepositoryPage> {
  const result = await invokeProxy<RepositoryPage>({
    action: "repos",
    pageId: args.pageId,
  });
  return result ?? EMPTY_REPOSITORY_PAGE;
}

export async function getLocalGithubRepositoryBranches(args: {
  repository: string;
  query?: string;
  pageId?: string;
}): Promise<BranchPage> {
  const result = await invokeProxy<BranchPage>({
    action: "branches",
    repository: args.repository,
    query: args.query,
    pageId: args.pageId,
  });
  return result ?? EMPTY_BRANCH_PAGE;
}
