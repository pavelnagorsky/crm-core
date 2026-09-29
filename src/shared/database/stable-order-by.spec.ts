import { OrderDirection } from '../enums/order-direction.enum.js';
import { stableOrderBy } from './stable-order-by.js';

describe('stableOrderBy', () => {
  it('appends id so tied rows keep a fixed page boundary', () => {
    expect(stableOrderBy({ earnedOn: OrderDirection.DESC }, OrderDirection.DESC)).toEqual([
      { earnedOn: OrderDirection.DESC },
      { id: OrderDirection.DESC },
    ]);
  });

  it('keeps a multi-column order and still appends id', () => {
    expect(
      stableOrderBy(
        [{ clientLastName: OrderDirection.ASC }, { clientFirstName: OrderDirection.ASC }],
        OrderDirection.ASC,
      ),
    ).toEqual([
      { clientLastName: OrderDirection.ASC },
      { clientFirstName: OrderDirection.ASC },
      { id: OrderDirection.ASC },
    ]);
  });
});
