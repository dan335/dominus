forumSettings = {
  categories: [
    {id:0, name: 'Dominus News'},
    {id:1, name: 'Dominus General'},
    {id:2, name: 'Feature Requests'},
    {id:3, name: 'Bugs'},
    {id:4, name: 'Everything Else'}
  ]
}

marked.setOptions({
  renderer: new marked.Renderer(),
  gfm: true,
  tables: true,
  breaks: true,
  pedantic: false,
  sanitize: true,
  smartLists: true,
  smartypants: false
});
