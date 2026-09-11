/**
 * Structure of mock_data/restaurant.json (single object, not an array).
 */
export interface Restaurant {
  restaurant_id: string;
  name: string;
  type: string;
  currency: string;
  timezone: string;
  data_period: {
    from: string;
    to: string;
  };
}
