Template.coordLink.events({
  'click .coordLink': function(event, template) {
    event.preventDefault()
    dHexmap.centerOnHex(template.data.x, template.data.y)
  }
})
