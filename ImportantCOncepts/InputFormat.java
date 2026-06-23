
package ImportantCOncepts;

import java.util.*;
import java.io.*;

class InputFormat {
    public static void main(String[] args) throws IOException {
        BufferedReader bf = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer("");

        // reading input and
        System.out.println("enter array size : ");
        if (!st.hasMoreTokens())
            st = new StringTokenizer(bf.readLine());
        int n = Integer.parseInt(st.nextToken());
        int arr[] = new int[n];
        System.out.println("eneter the array element : ");
        for (int i = 0; i < n; i++) {
            if (!st.hasMoreTokens())
                st = new StringTokenizer(bf.readLine());
            arr[i] = Integer.parseInt(st.nextToken());
        }
        for (int i = 0; i < n; i++) {
            System.out.print(arr[i] + " ");
        }
        System.out.println();

    }

}