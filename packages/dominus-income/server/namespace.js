dIncome = {};

// runs a raw bulk op and logs an error instead of throwing it, as the
// callbacks these replaced did
dIncome.executeBulk = async function(bulk) {
  try {
    await bulk.execute();
  } catch (error) {
    console.error(error);
  }
};
