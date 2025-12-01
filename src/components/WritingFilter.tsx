import { useState } from "react";

interface Post {
  slug: string;
  title: string;
  description: string;
  formattedDate: string;
  readingTime: number;
  category?: string;
  isLatest?: boolean;
}

interface WritingFilterProps {
  posts: Post[];
  showLatestFeatured?: boolean;
}

const CATEGORIES = ["All", "Interactive", "Philosophy", "Projects"] as const;

export default function WritingFilter({ posts, showLatestFeatured = false }: WritingFilterProps) {
  const [activeFilter, setActiveFilter] = useState<string>("All");

  const filteredPosts = activeFilter === "All" 
    ? posts 
    : posts.filter(post => post.category === activeFilter);

  const latestPost = showLatestFeatured ? filteredPosts[0] : null;
  const otherPosts = showLatestFeatured ? filteredPosts.slice(1) : filteredPosts;

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setActiveFilter(category)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeFilter === category
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Posts */}
      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No posts in this category yet.
          </p>
        ) : (
          <>
            {/* Featured Latest Post (for home page) */}
            {latestPost && showLatestFeatured && (
              <a
                href={`/writing/${latestPost.slug}`}
                className="block group bg-gray-50 dark:bg-neutral-900 rounded-2xl p-6 md:p-8 border border-gray-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all"
              >
                <div className="flex items-center gap-2 mb-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-sparkles text-blue-600"
                  >
                    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
                  </svg>
                  <span className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
                    Latest Post
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {latestPost.title}
                </h2>
                <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                  {latestPost.description}
                </p>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{latestPost.formattedDate}</span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                  <span>{latestPost.readingTime} min read</span>
                </div>
              </a>
            )}

            {/* Other Posts */}
            {otherPosts.map((post) => (
              <a
                key={post.slug}
                href={`/writing/${post.slug}`}
                className="block group bg-gray-50 dark:bg-neutral-900 rounded-2xl p-5 border border-gray-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all"
              >
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">
                  {post.title}
                </h4>
                {!showLatestFeatured && post.description && (
                  <p className="text-gray-600 dark:text-gray-400 mb-3">
                    {post.description}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>{post.formattedDate}</span>
                  <span className="inline-block w-1 h-1 rounded-full bg-gray-400"></span>
                  <span>{post.readingTime} min read</span>
                </div>
              </a>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

