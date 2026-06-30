// Debug Mock Script
if (window.location.search.includes('mock=true')) {
  window.__logs = [];
  const originalLog = console.log;
  console.log = function(...args) {
    window.__logs.push(args.map(x => (typeof x === 'object') ? JSON.stringify(x) : String(x)).join(' '));
    originalLog.apply(console, args);
  };

  console.log('[DevAssist Mock] Initializing mocks for local testing');
  localStorage.setItem('authMethod', "oauth");
  localStorage.setItem('githubOauthToken', "mock-github-token");
  localStorage.setItem('backendUrl', "https://devassist-yfli.onrender.com");
  localStorage.setItem('geminiApiKey', "mock-gemini-key");

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      authMethod: 'oauth',
      githubOauthToken: 'mock-github-token',
      backendUrl: 'https://devassist-yfli.onrender.com',
      geminiApiKey: 'mock-gemini-key'
    }, () => {
      console.log('[DevAssist Mock] chrome.storage.local populated');
    });
  }

  const originalFetch = window.fetch;
  window.fetch = async function(url, options) {
    const urlStr = url.toString();
    if (urlStr.includes('generativelanguage.googleapis.com')) {
      console.log('[DevAssist Mock] Intercepted Gemini API request');
      let responseText = "Mock AI insight generated successfully.";
      try {
        const body = JSON.parse(options.body);
        const promptText = body.contents[0].parts[0].text;
        console.log('[DevAssist Mock] Prompt Text:', promptText);
        console.log('[DevAssist Mock] includes professional summary:', promptText.includes('professional developer summary'));
        console.log('[DevAssist Mock] includes bullet points:', promptText.includes('bullet points, explain what kind of developer'));
        console.log('[DevAssist Mock] includes learning path:', promptText.includes('personalized 3-step learning path'));
        console.log('[DevAssist Mock] includes project ideas:', promptText.includes('suggest 3 creative and impactful new project ideas'));
        if (promptText.includes('ping')) {
          return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "pong" }] } }] }), { status: 200 });
        }
        
        // Robust two-stage prompt matching for both cached and uncached prompts
        if (promptText.includes('action type: "repos"')) {
          responseText = "- **Specialized in Frontend & Extension Tooling**: Shows strong focus on web platforms, extension development, and interactive layouts.\n- **Passionate Builder**: Creates repositories for developer productivity and developer-assist systems.\n- **Clean Code Advocate**: Writes modern ES modules, well-structured templates, and clean visual themes.";
        } else if (promptText.includes('action type: "learning"')) {
          responseText = "1. **Master Advanced TypeScript**: Explore design patterns, advanced generic types, and decorators to make your libraries robust.\n2. **Deep-Dive into Cloud/Serverless**: Learn Node.js backend frameworks, Firestore/Firebase integration, and real-time database synchronizations.\n3. **Explore System Architecture & Testing**: Practice building unit-tested apps and study Chrome Extension V3 lifecycle management for offline capability.";
        } else if (promptText.includes('action type: "ideas"')) {
          responseText = "1. **TaskFlow Dashboard**: A Chrome Extension to visualize local git logs in real-time charts.\n2. **GistSnippet manager**: A developer tool utilizing AI to summarize public gists on the fly.\n3. **DevHealth Monitor**: A developer dashboard tracking local API rate limits and alert thresholds.";
        } else if (promptText.includes('action type: "summarize"')) {
          responseText = "Mock User (@mockuser) is an experienced developer with a solid foundation in JavaScript and TypeScript. Over the years, they have built several repositories reflecting a passion for web application development and tooling. Their active contribution and consistent presence in the community highlights a strong drive for learning and engineering excellence.";
        }
        // Stage 2: Uncached new prompts (where other instructions are not in the prompt body)
        else if (promptText.includes('Provide bullet points, explain what kind of developer') || promptText.includes('bullet points, explain what kind of developer')) {
          responseText = "- **Specialized in Frontend & Extension Tooling**: Shows strong focus on web platforms, extension development, and interactive layouts.\n- **Passionate Builder**: Creates repositories for developer productivity and developer-assist systems.\n- **Clean Code Advocate**: Writes modern ES modules, well-structured templates, and clean visual themes.";
        } else if (promptText.includes('Suggest a personalized 3-step learning path') || promptText.includes('personalized 3-step learning path')) {
          responseText = "1. **Master Advanced TypeScript**: Explore design patterns, advanced generic types, and decorators to make your libraries robust.\n2. **Deep-Dive into Cloud/Serverless**: Learn Node.js backend frameworks, Firestore/Firebase integration, and real-time database synchronizations.\n3. **Explore System Architecture & Testing**: Practice building unit-tested apps and study Chrome Extension V3 lifecycle management for offline capability.";
        } else if (promptText.includes('Suggest 3 creative and impactful new project ideas') || promptText.includes('suggest 3 creative and impactful new project ideas')) {
          responseText = "1. **TaskFlow Dashboard**: A Chrome Extension to visualize local git logs in real-time charts.\n2. **GistSnippet manager**: A developer tool utilizing AI to summarize public gists on the fly.\n3. **DevHealth Monitor**: A developer dashboard tracking local API rate limits and alert thresholds.";
        } else {
          responseText = "Mock User (@mockuser) is an experienced developer with a solid foundation in JavaScript and TypeScript. Over the years, they have built several repositories reflecting a passion for web application development and tooling. Their active contribution and consistent presence in the community highlights a strong drive for learning and engineering excellence.";
        }
      } catch (e) {
        console.error('[DevAssist Mock] Error parsing Gemini request body', e);
      }
      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: responseText
                }
              ]
            }
          }
        ]
      }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
    if (urlStr.includes('api.github.com/user') && !urlStr.includes('/repos') && !urlStr.includes('/followers') && !urlStr.includes('/following')) {
      console.log('[DevAssist Mock] Intercepted user profile request');
      return new Response(JSON.stringify({
        login: "mockuser",
        name: "Mock User",
        avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4",
        company: "Mock Company",
        location: "Mock Location",
        blog: "mock.blog",
        created_at: "2020-01-01T00:00:00Z",
        public_repos: 5,
        followers: 12,
        following: 8,
        public_gists: 2
      }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '4999',
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 3600).toString()
        })
      });
    }
    if (urlStr.includes('/users/') && !urlStr.includes('/repos') && !urlStr.includes('/followers') && !urlStr.includes('/following')) {
      const parts = urlStr.split('/users/');
      const login = parts[1].split('?')[0].split('/')[0];
      console.log(`[DevAssist Mock] Intercepted profile request for: ${login}`);
      const name = login.charAt(0).toUpperCase() + login.slice(1).replace('_', ' ');

      return new Response(JSON.stringify({
        login: login,
        name: name,
        avatar_url: `https://avatars.githubusercontent.com/u/${Math.floor(Math.random() * 10000)}?v=4`,
        company: "Mock Company",
        location: "Mock Location",
        blog: "mock.blog",
        created_at: "2020-01-01T00:00:00Z",
        public_repos: 5,
        followers: 12,
        following: 8,
        public_gists: 2
      }), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '4999',
          'X-RateLimit-Limit': '5000',
          'X-RateLimit-Reset': Math.floor(Date.now() / 1000 + 3600).toString()
        })
      });
    }
    if (urlStr.includes('/repos')) {
      console.log('[DevAssist Mock] Intercepted repos request');
      return new Response(JSON.stringify([
        {
          name: "repo-one",
          language: "JavaScript",
          stargazers_count: 15,
          forks_count: 3,
          updated_at: "2026-06-01T00:00:00Z"
        },
        {
          name: "repo-two",
          language: "TypeScript",
          stargazers_count: 42,
          forks_count: 7,
          updated_at: "2026-06-10T00:00:00Z"
        },
        {
          name: "repo-three",
          language: "JavaScript",
          stargazers_count: 8,
          forks_count: 1,
          updated_at: "2026-05-20T00:00:00Z"
        }
      ]), {
        status: 200,
        headers: new Headers({
          'Content-Type': 'application/json'
        })
      });
    }
    if (urlStr.includes('/followers')) {
      console.log('[DevAssist Mock] Intercepted followers request');
      return new Response(JSON.stringify([
        { login: "alex_dev", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
        { login: "maria_s", avatar_url: "https://avatars.githubusercontent.com/u/2?v=4" },
        { login: "hacker_guy", avatar_url: "https://avatars.githubusercontent.com/u/3?v=4" },
        { login: "lucas_w", avatar_url: "https://avatars.githubusercontent.com/u/5?v=4" }
      ]), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
    if (urlStr.includes('/following')) {
      console.log('[DevAssist Mock] Intercepted following request');
      return new Response(JSON.stringify([
        { login: "maria_s", avatar_url: "https://avatars.githubusercontent.com/u/2?v=4" },
        { login: "lucas_w", avatar_url: "https://avatars.githubusercontent.com/u/5?v=4" },
        { login: "tech_lead", avatar_url: "https://avatars.githubusercontent.com/u/6?v=4" },
        { login: "open_sourcerer", avatar_url: "https://avatars.githubusercontent.com/u/7?v=4" }
      ]), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
    if (urlStr.includes('/health')) {
      return new Response(JSON.stringify({ status: "healthy" }), { status: 200 });
    }
    return originalFetch.apply(this, arguments);
  };
}
