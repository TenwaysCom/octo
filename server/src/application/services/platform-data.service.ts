import {
  PostgresPlatformSyncStore,
  type GitHubPullRequestSyncRef,
  type GitHubPullRequestListFilters,
  type LarkBaseTicketListFilters,
  type MeegleWorkitemListFilters,
  type PlatformSyncStore,
} from "../../adapters/postgres/platform-sync-store.js";
import type { OdooDevopsEnvironment } from "../../adapters/odoo-devops/odoo-devops-branches-client.js";
import type { OdooDevopsBranchesService } from "./odoo-devops-branches.service.js";
import { logger } from "../../logger.js";
import {
  resolveGitHubRepoEnvironment,
} from "./odoo-devops-environment-mapping.js";
import { buildLarkTicketCleaningProjection } from "./lark-ticket-cleaning.js";
import {
  buildMeegleSprintSnapshot,
  buildMeegleSprintWorkitemProjections,
} from "./meegle-sprint-snapshot.js";

export type PlatformDataKind = "lark-tickets" | "meegle-workitems" | "github-pull-requests";
export interface OdooShBuild {
  environment: OdooDevopsEnvironment;
  status: string;
  result: string;
}

const serviceLogger = logger.child({ module: "platform-data-service" });

export class PlatformDataService {
  private store?: PlatformSyncStore;

  constructor(
    store?: PlatformSyncStore,
    private readonly odooDevopsBranchesService?: Pick<OdooDevopsBranchesService, "list">,
  ) {
    this.store = store;
  }

  async list(kind: PlatformDataKind, limit: number, filters: { larkTickets?: LarkBaseTicketListFilters; meegleWorkitems?: MeegleWorkitemListFilters; githubPullRequests?: GitHubPullRequestListFilters } = {}) {
    switch (kind) {
      case "lark-tickets":
        {
          const [items, total] = await Promise.all([
            this.syncStore.listLarkBaseTickets(limit, filters.larkTickets),
            this.syncStore.countLarkBaseTickets(filters.larkTickets),
          ]);
          return {
            items: items.map(({ sourceFields, ...item }) => {
              const requester = item.requester
                ?? buildLarkTicketCleaningProjection(sourceFields, item.createdTime).requester;
              return { ...item, ...(requester ? { requester } : {}) };
            }),
            total,
          };
        }
      case "meegle-workitems":
        {
          const [items, total, sprints, relatedPersonOptions] = await Promise.all([
            this.syncStore.listMeegleWorkitems(limit, filters.meegleWorkitems),
            this.syncStore.countMeegleWorkitems(filters.meegleWorkitems),
            this.syncStore.listMeegleSprints(),
            this.syncStore.listMeegleRelatedPersonOptions(),
          ]);
          return {
            items: await this.attachMeegleRelations(items),
            sprints,
            relatedPersonOptions,
            total,
          };
        }
      case "github-pull-requests":
        {
          const [items, total] = await Promise.all([
            this.syncStore.listGitHubPullRequests(limit, filters.githubPullRequests),
            this.syncStore.countGitHubPullRequests(filters.githubPullRequests),
          ]);
          const environmentByPullRequest = new Map(
            items.map((item) => [item, resolveGitHubRepoEnvironment(item.repo)]),
          );
          const environments = new Set<OdooDevopsEnvironment>();
          for (const item of items) {
            const environment = environmentByPullRequest.get(item);
            if (item.headRef && environment) {
              environments.add(environment);
            }
          }
          const buildsByBranch = await this.listOdooShBuildsByBranch(environments);
          return {
            items: items.map((item) => {
              const { description: _description, ...listItem } = item;
              return {
                ...listItem,
                odooShBuilds: selectOdooShBuilds(
                  buildsByBranch,
                  item.headRef,
                  environmentByPullRequest.get(item),
                ),
              };
            }),
            total,
          };
        }
    }
  }

  async listMeegleSprintHistory() {
    const [sprintSnapshots, sprintMemberships] = await Promise.all([
      this.syncStore.listMeegleSprintSnapshots(),
      this.syncStore.listMeegleSprintMemberships(),
    ]);
    const sprintDetails = sprintSnapshots.flatMap((item) => {
      const sprint = buildMeegleSprintSnapshot(item);
      return sprint ? [sprint] : [];
    });
    const sprintWorkitems = buildMeegleSprintWorkitemProjections(sprintMemberships, sprintDetails);
    return {
      sprintDetails,
      sprintWorkitems: await this.attachMeegleRelations(sprintWorkitems),
    };
  }

  async getGitHubPullRequestPreview(ref: GitHubPullRequestSyncRef) {
    const pullRequest = await this.syncStore.findGitHubPullRequest(ref);
    if (!pullRequest) return undefined;

    const meegleWorkitems = await this.syncStore.listMeegleWorkitemsByIds(pullRequest.meegleIds);
    const linkedIds = new Set(pullRequest.meegleIds);
    const environment = resolveGitHubRepoEnvironment(pullRequest.repo);
    const buildsByBranch = await this.listOdooShBuildsByBranch(
      pullRequest.headRef && environment ? [environment] : [],
    );
    return {
      ...pullRequest,
      meegleWorkitems: meegleWorkitems
        .filter((workitem) => linkedIds.has(workitem.workItemId))
        .map((workitem) => ({
          projectKey: workitem.projectKey,
          ...(workitem.projectName ? { projectName: workitem.projectName } : {}),
          workItemTypeKey: workitem.workItemTypeKey,
          workItemId: workitem.workItemId,
          ...(workitem.workItemKey ? { workItemKey: workitem.workItemKey } : {}),
          title: workitem.title,
          ...(workitem.workItemType ? { workItemType: workitem.workItemType } : {}),
          ...(workitem.status ? { status: workitem.status } : {}),
          ...(workitem.sprint ? { sprint: workitem.sprint } : {}),
          ...(workitem.version ? { version: workitem.version } : {}),
        })),
      odooShBuilds: selectOdooShBuilds(buildsByBranch, pullRequest.headRef, environment),
    };
  }

  private get syncStore(): PlatformSyncStore {
    this.store ??= new PostgresPlatformSyncStore();
    return this.store;
  }

  private async attachMeegleRelations<T extends { projectKey: string; workItemTypeKey: string; workItemId: string }>(items: T[]) {
    const [links, roleMembers] = await Promise.all([
      this.syncStore.listGitHubPullRequestLinks([...new Set(items.map((item) => item.workItemId))]),
      this.syncStore.listMeegleWorkitemRoleMembers(items),
    ]);
    const linksByWorkItemId = new Map<string, typeof links>();
    for (const link of links) {
      const current = linksByWorkItemId.get(link.meegleId) ?? [];
      current.push(link);
      linksByWorkItemId.set(link.meegleId, current);
    }
    const rolesByWorkitem = new Map<string, Array<{
      roleKey: string;
      roleName: string;
      members: Array<{ memberKey: string; name: string }>;
    }>>();
    for (const member of roleMembers) {
      const key = meegleWorkitemIdentity(member);
      const roles = rolesByWorkitem.get(key) ?? [];
      let role = roles.find((candidate) => candidate.roleKey === member.roleKey);
      if (!role) {
        role = { roleKey: member.roleKey, roleName: member.roleName, members: [] };
        roles.push(role);
      }
      role.members.push({ memberKey: member.memberKey, name: member.memberName });
      rolesByWorkitem.set(key, roles);
    }
    return items.map((item) => ({
      ...item,
      githubPullRequests: (linksByWorkItemId.get(item.workItemId) ?? []).map((pullRequest) => ({
        ...pullRequest,
        odooShBuilds: [],
      })),
      relatedPeople: rolesByWorkitem.get(meegleWorkitemIdentity(item)) ?? [],
    }));
  }

  private async listOdooShBuildsByBranch(
    environments: Iterable<OdooDevopsEnvironment>,
  ): Promise<Map<string, OdooShBuild[]>> {
    const buildsByBranch = new Map<string, OdooShBuild[]>();
    const odooDevopsBranchesService = this.odooDevopsBranchesService;
    const requestedEnvironments = [...new Set(environments)];
    if (!odooDevopsBranchesService || requestedEnvironments.length === 0) {
      return buildsByBranch;
    }

    await Promise.all(requestedEnvironments.map(async (environment) => {
      try {
        const snapshot = await odooDevopsBranchesService.list(environment);
        for (const branch of snapshot.items) {
          const builds = buildsByBranch.get(branch.branch) ?? [];
          builds.push({
            environment,
            status: branch.last_build_status,
            result: branch.last_build_result,
          });
          buildsByBranch.set(branch.branch, builds);
        }
      } catch {
        serviceLogger.warn({ environment }, "ODOO_DEVOPS_BRANCHES_UNAVAILABLE_FOR_PLATFORM_DATA");
      }
    }));

    return buildsByBranch;
  }
}

function meegleWorkitemIdentity(item: { projectKey: string; workItemTypeKey: string; workItemId: string }): string {
  return `${item.projectKey}\u0000${item.workItemTypeKey}\u0000${item.workItemId}`;
}

function selectOdooShBuilds(
  buildsByBranch: Map<string, OdooShBuild[]>,
  headRef: string | undefined,
  environment: OdooDevopsEnvironment | undefined,
): OdooShBuild[] {
  if (!headRef || !environment) {
    return [];
  }
  return (buildsByBranch.get(headRef) ?? []).filter((build) => build.environment === environment);
}
