import axios from 'axios';

export const fetchUserGithubData = async (accessToken, githubUsername) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
  };

  try {
    const reposResponse = await axios.get('https://api.github.com/user/repos', {
      headers,
      params: {
        sort: 'updated',
        per_page: 15,
        type: 'owner',
      },
    });

    const repos = reposResponse.data;
    const formattedRepos = [];

    for (const repo of repos) {
      if (repo.fork) continue;

      let readmeContent = null;
      try {
        const readmeResponse = await axios.get(
          `https://api.github.com/repos/${repo.owner.login}/${repo.name}/readme`,
          { headers }
        );
        readmeContent = Buffer.from(readmeResponse.data.content, 'base64').toString('utf-8');
      } catch (err) {
        if (err.response && err.response.status !== 404) {
          console.warn(`Failed to fetch README for ${repo.name}`, err.message);
        }
      }

      let recentCommits = [];
      try {
        const commitsResponse = await axios.get(
          `https://api.github.com/repos/${repo.owner.login}/${repo.name}/commits`,
          { headers, params: { per_page: 5 } }
        );
        recentCommits = commitsResponse.data.map((c) => c.commit.message);
      } catch (err) {
        if (err.response && err.response.status !== 409) {
          console.warn(`Failed to fetch commits for ${repo.name}`, err.message);
        }
      }

      formattedRepos.push({
        name: repo.name,
        url: repo.html_url,
        description: repo.description || '',
        language: repo.language || '',
        topics: repo.topics || [],
        stars: repo.stargazers_count,
        readme: readmeContent || '',
        recent_commits: recentCommits,
      });
    }

    return formattedRepos;
  } catch (error) {
    console.error('Error fetching GitHub data:', error.message);
    throw error;
  }
};
