export function buildWishPlan(wishes, availableBudget) {
  let cumulative = 0;
  return wishes.map((wish, index) => {
    cumulative += wish.price;
    return {
      ...wish,
      order: index + 1,
      cumulative,
      withinBudget: cumulative <= availableBudget,
    };
  });
}
