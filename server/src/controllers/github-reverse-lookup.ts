import { logger } from "../logger.js";
import type { GitHubClient } from "../adapters/github/github-client.js";
import type { MeegleClient, MeegleWorkitem } from "../adapters/meegle/meegle-client.js";
import { extractMeegleIds } from "../domain/meegle-id-extractor.js";

const lookupLogger = logger.child({ module: "github-reverse-lookup" });

export interface LookupResult {
  prInfo: {
    title: string;
    description: string | null;
    url: string;
  };
  extractedIds: string[];
  workitems: MeegleWorkitem[];
  notFound: string[];
}

export class GitHubReverseLookupController {
  constructor(
    private githubClient: GitHubClient,
    private meegleClient: MeegleClient
  ) {}

  async lookup(prUrl: string): Promise<LookupResult> {
    lookupLogger.info({ prUrl }, "Starting GitHub PR lookup");

    // Parse PR URL
    const { owner, repo, pullNumber } = this.githubClient.parsePrUrl(prUrl);
    lookupLogger.debug({ owner, repo, pullNumber }, "Parsed PR URL");

    // Fetch all PR data
    const [prDetails, commits, issueComments, reviewComments] = await Promise.all([
      this.githubClient.getPullRequest(owner, repo, pullNumber),
      this.githubClient.getCommits(owner, repo, pullNumber),
      this.githubClient.getIssueComments(owner, repo, pullNumber),
      this.githubClient.getReviewComments(owner, repo, pullNumber),
    ]);

    // Extract Meegle IDs
    const extractedIds = extractMeegleIds({
      title: prDetails.title,
      description: prDetails.body,
      commits: commits.map(c => ({ message: c.commit.message })),
      comments: [
        ...issueComments.map(c => ({ body: c.body })),
        ...reviewComments.map(c => ({ body: c.body })),
      ],
    });

    lookupLogger.info({ extractedIds }, "Extracted Meegle IDs");

    if (extractedIds.length === 0) {
      const error = new Error("No Meegle IDs found in PR");
      (error as Error & { code: string }).code = "NO_MEEGLE_ID_FOUND";
      throw error;
    }

    // Query Meegle
    const meegleWorkitems = await this.meegleClient.filterWorkitemsAcrossProjects({
      workItemIds: extractedIds,
      pageSize: 50,
    });

    // Map to result format
    const foundIds = new Set(meegleWorkitems.map(w => w.id));
    const notFound = extractedIds.filter(id => !foundIds.has(id));

    return {
      prInfo: {
        title: prDetails.title,
        description: prDetails.body,
        url: prDetails.html_url,
      },
      extractedIds,
      workitems: meegleWorkitems.map(w => w),
      notFound,
    };
  }
}
