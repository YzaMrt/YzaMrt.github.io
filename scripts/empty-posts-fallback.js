'use strict';

// Keep the home page and archive page alive even when no post is published.
// Hexo's index/archive generators return no route for an empty post list,
// which would turn the site root into a 404 after deleting the last article.
hexo.extend.generator.register('empty-posts-fallback', function (locals) {
  if (locals.posts.length) return [];

  const data = {
    posts: locals.posts,
    current: 1,
    total: 1,
    prev: 0,
    next: 0,
    __index: true
  };

  return [
    { path: 'index.html', layout: ['index', 'archive'], data },
    { path: 'archives/index.html', layout: ['archive', 'page'], data }
  ];
});
