import { StockController } from './stock.controller';

describe('StockController', () => {
  let stockService: { setStock: jest.Mock };
  let controller: StockController;

  beforeEach(() => {
    stockService = {
      setStock: jest.fn().mockResolvedValue({ productId: 'p1', totalQuantity: 10 }),
    };
    controller = new StockController(stockService as never);
  });

  it('delegates to StockService with the request body fields', async () => {
    const result = await controller.setStock({ productId: 'p1', quantity: 10 });

    expect(stockService.setStock).toHaveBeenCalledWith('p1', 10);
    expect(result).toEqual({ productId: 'p1', totalQuantity: 10 });
  });
});
