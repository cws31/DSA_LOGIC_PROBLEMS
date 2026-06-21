import java.util.*;

public class Main {
    public static void main(String[] args) {
        Solution sol = new Solution();
        try {
            {
                System.out.println("CASE|0|EXPECTED|165.00000|ACTUAL|" + sol.angleClock(12, 30));
            }
        } catch (Exception e) {
            System.out.println("CASE_ERROR|" + e.getMessage());
            e.printStackTrace();
        }
    }
}
