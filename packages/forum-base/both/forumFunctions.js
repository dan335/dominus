prepareTextForForum = function(text) {
    text = text.replace(/\r?\n/g, '<br />');
    return text.replace(/<(?!br\s*\/?)[^>]+>/g, '');
};
