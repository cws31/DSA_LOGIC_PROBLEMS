package POD;

import java.util.Arrays;

public class maxIceCream {
    public int max_IceCream(int[] costs, int coins) {
        Arrays.sort(costs);
        int c = 0;
        for (int i : costs) {
            coins -= i;
            if (coins >= 0) c++;
            else return c;
        }
        return c;
    }
}